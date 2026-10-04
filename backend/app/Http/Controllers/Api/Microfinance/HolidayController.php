<?php

namespace App\Http\Controllers\Api\Microfinance;

use App\Http\Controllers\Controller;
use App\Models\Finance;
use App\Models\MicrofinanceHoliday;
use App\Models\MicrofinanceHolidayLoanDateShift;
use App\Models\MicrofinanceLoanRequest;
use App\Models\Mortgage;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HolidayController extends Controller
{
    public function index()
    {
        return response()->json(MicrofinanceHoliday::query()->orderByDesc('holiday_date')->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'holiday_date' => 'required|date|unique:mf_holidays,holiday_date',
            'name' => 'required|string|max:120',
            'note' => 'nullable|string|max:500',
            'is_active' => 'nullable|boolean',
        ]);

        $holiday = MicrofinanceHoliday::create([
            'holiday_date' => $validated['holiday_date'],
            'name' => $validated['name'],
            'note' => $validated['note'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'created_by' => optional($request->user())->id,
        ]);

        $shiftedCount = 0;
        if ((bool) $holiday->is_active) {
            $shiftedCount = $this->forwardCollectionDatesForHoliday(
                Carbon::parse((string) $holiday->holiday_date)->toDateString(),
                (int) $holiday->id
            );
        }

        return response()->json([
            'message' => "Holiday marked successfully. Forwarded {$shiftedCount} collection date(s).",
            'data' => $holiday,
            'shifted_count' => $shiftedCount,
        ], 201);
    }

    public function show(MicrofinanceHoliday $holiday)
    {
        return response()->json($holiday);
    }

    public function update(Request $request, MicrofinanceHoliday $holiday)
    {
        $validated = $request->validate([
            'holiday_date' => 'required|date|unique:mf_holidays,holiday_date,' . $holiday->id,
            'name' => 'required|string|max:120',
            'note' => 'nullable|string|max:500',
            'is_active' => 'nullable|boolean',
        ]);

        $wasActive = (bool) $holiday->is_active;
        $shiftedCount = 0;
        DB::transaction(function () use ($holiday, $validated, $wasActive, &$shiftedCount): void {
            if ($wasActive) {
                // Rewind prior shifts before applying updated holiday settings.
                $this->restoreLoanDatesFromHolidayShifts((int) $holiday->id);
            }

            $holiday->update([
                'holiday_date' => $validated['holiday_date'],
                'name' => $validated['name'],
                'note' => $validated['note'] ?? null,
                'is_active' => $validated['is_active'] ?? true,
            ]);

            if ((bool) $holiday->is_active) {
                $shiftedCount = $this->forwardCollectionDatesForHoliday(
                    Carbon::parse((string) $holiday->holiday_date)->toDateString(),
                    (int) $holiday->id
                );
            }
        });

        return response()->json([
            'message' => "Holiday updated successfully. Forwarded {$shiftedCount} collection date(s).",
            'data' => $holiday,
            'shifted_count' => $shiftedCount,
        ]);
    }

    public function destroy(MicrofinanceHoliday $holiday)
    {
        $holidayDate = Carbon::parse((string) $holiday->holiday_date)->toDateString();

        $recoveredCount = DB::transaction(function () use ($holiday, $holidayDate) {
            $recoveredCount = $this->restoreLoanDatesFromHolidayShifts((int) $holiday->id);

            if ($recoveredCount === 0) {
                $recoveredCount = $this->recoverLoanDatesUsingLegacyInference($holidayDate);
            }

            $holiday->delete();

            return $recoveredCount;
        });

        return response()->json([
            'message' => "Holiday deleted successfully. Restored {$recoveredCount} loan collection/due date(s) to their previous values.",
            'recovered_count' => $recoveredCount,
        ]);
    }

    private function forwardCollectionDatesForHoliday(string $holidayDate, int $holidayId): int
    {
        $activeHolidayDates = MicrofinanceHoliday::query()
            ->where('is_active', true)
            ->pluck('holiday_date')
            ->map(static fn ($date) => Carbon::parse((string) $date)->toDateString())
            ->all();

        $holidayLookup = array_flip($activeHolidayDates);
        $shiftedCount = 0;

        $shiftedCount += $this->forwardMicrofinanceDatesForHoliday($holidayDate, $holidayLookup, $holidayId);
        $shiftedCount += $this->forwardFinanceDatesForHoliday($holidayDate, $holidayLookup, $holidayId);
        $shiftedCount += $this->forwardMortgageDatesForHoliday($holidayDate, $holidayLookup, $holidayId);

        return $shiftedCount;
    }

    private function restoreLoanDatesFromHolidayShifts(int $holidayId): int
    {
        $shifts = MicrofinanceHolidayLoanDateShift::query()
            ->where('mf_holiday_id', $holidayId)
            ->get();

        $recoveredCount = 0;

        foreach ($shifts as $shift) {
            if ($this->restoreLoanDateShift($shift)) {
                $recoveredCount++;
            }
        }

        return $recoveredCount;
    }

    private function restoreLoanDateShift(MicrofinanceHolidayLoanDateShift $shift): bool
    {
        $loan = match ($shift->loan_type) {
            'microfinance' => MicrofinanceLoanRequest::query()->find($shift->loan_id),
            'finance' => Finance::query()->find($shift->loan_id),
            'mortgage' => Mortgage::query()->find($shift->loan_id),
            default => null,
        };

        if (!$loan) {
            return false;
        }

        $field = (string) $shift->field_name;
        if (!in_array($field, ['due_date', 'next_payment_date', 'next_collection_date'], true)) {
            return false;
        }

        $currentValue = $loan->{$field} ?? null;
        if (empty($currentValue)) {
            return false;
        }

        $currentDate = Carbon::parse((string) $currentValue)->toDateString();
        $shiftedDate = Carbon::parse((string) $shift->shifted_date)->toDateString();
        $originalDate = Carbon::parse((string) $shift->original_date)->toDateString();

        // Only revert when the loan still carries the date this holiday created.
        if ($currentDate !== $shiftedDate) {
            return false;
        }

        $loan->{$field} = $originalDate;

        if ($loan instanceof MicrofinanceLoanRequest && $field === 'due_date') {
            $graceDays = max((int) ($loan->penalty_grace_days ?? 2), 0);
            $loan->penalty_starts_on = Carbon::parse($originalDate)
                ->addDays($graceDays + 1)
                ->toDateString();
        }

        $loan->save();

        return true;
    }

    private function recordHolidayDateShift(
        int $holidayId,
        string $loanType,
        int $loanId,
        string $fieldName,
        string $originalDate,
        string $shiftedDate
    ): void {
        MicrofinanceHolidayLoanDateShift::query()->updateOrCreate(
            [
                'mf_holiday_id' => $holidayId,
                'loan_type' => $loanType,
                'loan_id' => $loanId,
                'field_name' => $fieldName,
            ],
            [
                'original_date' => $originalDate,
                'shifted_date' => $shiftedDate,
            ]
        );
    }

    private function recoverLoanDatesUsingLegacyInference(string $holidayDate): int
    {
        $activeHolidayDatesWithCurrent = MicrofinanceHoliday::query()
            ->where('is_active', true)
            ->pluck('holiday_date')
            ->map(static fn ($date) => Carbon::parse((string) $date)->toDateString())
            ->all();

        $holidayLookupWithCurrent = array_flip($activeHolidayDatesWithCurrent);
        $shiftedDate = $this->nextWorkingDate($holidayDate, $holidayLookupWithCurrent);

        $activeHolidayDatesWithoutCurrent = array_values(array_filter(
            $activeHolidayDatesWithCurrent,
            static fn (string $date) => $date !== $holidayDate
        ));

        $holidayLookupWithoutCurrent = array_flip($activeHolidayDatesWithoutCurrent);
        $recoveredDate = $this->firstWorkingDateOnOrAfter($holidayDate, $holidayLookupWithoutCurrent);

        if ($recoveredDate === $shiftedDate) {
            return 0;
        }

        $recoveredCount = 0;
        $recoveredCount += $this->recoverMicrofinanceDatesFromShiftedDate($shiftedDate, $recoveredDate);
        $recoveredCount += $this->recoverFinanceDatesFromShiftedDate($shiftedDate, $recoveredDate);
        $recoveredCount += $this->recoverMortgageDatesFromShiftedDate($shiftedDate, $recoveredDate);

        return $recoveredCount;
    }

    /**
     * @param array<string, int> $holidayLookup
     */
    private function forwardMicrofinanceDatesForHoliday(string $holidayDate, array $holidayLookup, int $holidayId): int
    {
        $affectedLoans = MicrofinanceLoanRequest::query()
            ->whereNotIn('status', ['closed', 'rejected'])
            ->where(function ($query) use ($holidayDate) {
                $query->whereDate('due_date', $holidayDate)
                    ->orWhereDate('next_payment_date', $holidayDate);
            })
            ->get();

        if ($affectedLoans->isEmpty()) {
            return 0;
        }

        $shiftedCount = 0;

        foreach ($affectedLoans as $loan) {
            /** @var MicrofinanceLoanRequest $loan */
            $didShift = false;

            if (!empty($loan->due_date) && Carbon::parse((string) $loan->due_date)->toDateString() === $holidayDate) {
                $originalDueDate = Carbon::parse((string) $loan->due_date)->toDateString();
                $newDueDate = $this->nextWorkingDate($holidayDate, $holidayLookup);
                $this->recordHolidayDateShift($holidayId, 'microfinance', (int) $loan->id, 'due_date', $originalDueDate, $newDueDate);
                $loan->setAttribute('due_date', $newDueDate);
                $didShift = true;
            }

            if (!empty($loan->next_payment_date) && Carbon::parse((string) $loan->next_payment_date)->toDateString() === $holidayDate) {
                $originalNextDate = Carbon::parse((string) $loan->next_payment_date)->toDateString();
                $newNextDate = $this->nextWorkingDate($holidayDate, $holidayLookup);
                $this->recordHolidayDateShift($holidayId, 'microfinance', (int) $loan->id, 'next_payment_date', $originalNextDate, $newNextDate);
                $loan->setAttribute('next_payment_date', $newNextDate);
                $didShift = true;
            }

            if ($didShift) {
                if (!empty($loan->due_date)) {
                    $graceDays = max((int) ($loan->penalty_grace_days ?? 2), 0);
                    $penaltyStartsOn = Carbon::parse((string) $loan->due_date)
                        ->addDays($graceDays + 1)
                        ->toDateString();
                    $loan->penalty_starts_on = $penaltyStartsOn;
                }

                $loan->save();
                $shiftedCount++;
            }
        }

        return $shiftedCount;
    }

    /**
     * @param array<string, int> $holidayLookup
     */
    private function forwardFinanceDatesForHoliday(string $holidayDate, array $holidayLookup, int $holidayId): int
    {
        $affectedLoans = Finance::query()
            ->whereNotIn('status', ['closed', 'rejected', 'settled'])
            ->where(function ($query) use ($holidayDate) {
                $query->whereDate('due_date', $holidayDate)
                    ->orWhereDate('next_collection_date', $holidayDate);
            })
            ->get();

        if ($affectedLoans->isEmpty()) {
            return 0;
        }

        $shiftedCount = 0;
        foreach ($affectedLoans as $loan) {
            /** @var Finance $loan */
            $didShift = false;

            if (!empty($loan->due_date) && Carbon::parse((string) $loan->due_date)->toDateString() === $holidayDate) {
                $originalDueDate = Carbon::parse((string) $loan->due_date)->toDateString();
                $newDueDate = $this->nextWorkingDate($holidayDate, $holidayLookup);
                $this->recordHolidayDateShift($holidayId, 'finance', (int) $loan->id, 'due_date', $originalDueDate, $newDueDate);
                $loan->setAttribute('due_date', $newDueDate);
                $didShift = true;
            }

            if (!empty($loan->next_collection_date) && Carbon::parse((string) $loan->next_collection_date)->toDateString() === $holidayDate) {
                $originalNextDate = Carbon::parse((string) $loan->next_collection_date)->toDateString();
                $newNextDate = $this->nextWorkingDate($holidayDate, $holidayLookup);
                $this->recordHolidayDateShift($holidayId, 'finance', (int) $loan->id, 'next_collection_date', $originalNextDate, $newNextDate);
                $loan->setAttribute('next_collection_date', $newNextDate);
                $didShift = true;
            }

            if ($didShift) {
                $loan->save();
                $shiftedCount++;
            }
        }

        return $shiftedCount;
    }

    /**
     * @param array<string, int> $holidayLookup
     */
    private function forwardMortgageDatesForHoliday(string $holidayDate, array $holidayLookup, int $holidayId): int
    {
        $affectedLoans = Mortgage::query()
            ->whereNotIn('status', ['closed', 'rejected', 'settled'])
            ->whereDate('due_date', $holidayDate)
            ->get();

        if ($affectedLoans->isEmpty()) {
            return 0;
        }

        $shiftedCount = 0;
        foreach ($affectedLoans as $loan) {
            /** @var Mortgage $loan */
            if (!empty($loan->due_date) && Carbon::parse((string) $loan->due_date)->toDateString() === $holidayDate) {
                $originalDueDate = Carbon::parse((string) $loan->due_date)->toDateString();
                $newDueDate = $this->nextWorkingDate($holidayDate, $holidayLookup);
                $this->recordHolidayDateShift($holidayId, 'mortgage', (int) $loan->id, 'due_date', $originalDueDate, $newDueDate);
                $loan->setAttribute('due_date', $newDueDate);
                $loan->save();
                $shiftedCount++;
            }
        }

        return $shiftedCount;
    }

    private function recoverMicrofinanceDatesFromShiftedDate(string $shiftedDate, string $recoveredDate): int
    {
        $affectedLoans = MicrofinanceLoanRequest::query()
            ->whereNotIn('status', ['closed', 'rejected'])
            ->where(function ($query) use ($shiftedDate) {
                $query->whereDate('due_date', $shiftedDate)
                    ->orWhereDate('next_payment_date', $shiftedDate);
            })
            ->get();

        if ($affectedLoans->isEmpty()) {
            return 0;
        }

        $recoveredCount = 0;
        foreach ($affectedLoans as $loan) {
            /** @var MicrofinanceLoanRequest $loan */
            $didRecover = false;

            if (!empty($loan->due_date) && Carbon::parse((string) $loan->due_date)->toDateString() === $shiftedDate) {
                $loan->setAttribute('due_date', $recoveredDate);
                $didRecover = true;
            }

            if (!empty($loan->next_payment_date) && Carbon::parse((string) $loan->next_payment_date)->toDateString() === $shiftedDate) {
                $loan->setAttribute('next_payment_date', $recoveredDate);
                $didRecover = true;
            }

            if ($didRecover) {
                if (!empty($loan->due_date)) {
                    $graceDays = max((int) ($loan->penalty_grace_days ?? 2), 0);
                    $loan->penalty_starts_on = Carbon::parse((string) $loan->due_date)
                        ->addDays($graceDays + 1)
                        ->toDateString();
                }

                $loan->save();
                $recoveredCount++;
            }
        }

        return $recoveredCount;
    }

    private function recoverFinanceDatesFromShiftedDate(string $shiftedDate, string $recoveredDate): int
    {
        $affectedLoans = Finance::query()
            ->whereNotIn('status', ['closed', 'rejected', 'settled'])
            ->where(function ($query) use ($shiftedDate) {
                $query->whereDate('due_date', $shiftedDate)
                    ->orWhereDate('next_collection_date', $shiftedDate);
            })
            ->get();

        if ($affectedLoans->isEmpty()) {
            return 0;
        }

        $recoveredCount = 0;
        foreach ($affectedLoans as $loan) {
            /** @var Finance $loan */
            $didRecover = false;

            if (!empty($loan->due_date) && Carbon::parse((string) $loan->due_date)->toDateString() === $shiftedDate) {
                $loan->setAttribute('due_date', $recoveredDate);
                $didRecover = true;
            }

            if (!empty($loan->next_collection_date) && Carbon::parse((string) $loan->next_collection_date)->toDateString() === $shiftedDate) {
                $loan->setAttribute('next_collection_date', $recoveredDate);
                $didRecover = true;
            }

            if ($didRecover) {
                $loan->save();
                $recoveredCount++;
            }
        }

        return $recoveredCount;
    }

    private function recoverMortgageDatesFromShiftedDate(string $shiftedDate, string $recoveredDate): int
    {
        $affectedLoans = Mortgage::query()
            ->whereNotIn('status', ['closed', 'rejected', 'settled'])
            ->whereDate('due_date', $shiftedDate)
            ->get();

        if ($affectedLoans->isEmpty()) {
            return 0;
        }

        $recoveredCount = 0;
        foreach ($affectedLoans as $loan) {
            /** @var Mortgage $loan */
            if (!empty($loan->due_date) && Carbon::parse((string) $loan->due_date)->toDateString() === $shiftedDate) {
                $loan->setAttribute('due_date', $recoveredDate);
                $loan->save();
                $recoveredCount++;
            }
        }

        return $recoveredCount;
    }

    /**
     * @param array<string, int> $holidayLookup
     */
    private function nextWorkingDate(string $date, array $holidayLookup): string
    {
        $cursor = Carbon::parse($date)->addDay();

        while (isset($holidayLookup[$cursor->toDateString()])) {
            $cursor->addDay();
        }

        return $cursor->toDateString();
    }

    /**
     * @param array<string, int> $holidayLookup
     */
    private function firstWorkingDateOnOrAfter(string $date, array $holidayLookup): string
    {
        $cursor = Carbon::parse($date);

        while (isset($holidayLookup[$cursor->toDateString()])) {
            $cursor->addDay();
        }

        return $cursor->toDateString();
    }
}
