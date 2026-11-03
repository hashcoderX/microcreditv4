<?php

namespace App\Console\Commands;

use App\Models\MicrofinanceLoanRequest;
use Illuminate\Console\Command;

class RecalculateMicrofinanceArrears extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'microfinance:recalculate-arrears
                            {--date= : Accrue arrears up to this date (YYYY-MM-DD). Defaults to today.}
                            {--branch_id= : Only process loans for a single branch id.}
                            {--chunk=500 : Chunk size for processing.}
                            {--dry-run : Calculate changes without persisting.}';

    /**
     * The console command description.
     */
    protected $description = 'Accrues microfinance arrears_balance automatically based on the repayment schedule and advances due_date as schedules pass.';

    public function handle(): int
    {
        $dateOption = (string) ($this->option('date') ?? '');
        $asOfDate = $dateOption !== ''
            ? new \DateTimeImmutable($dateOption)
            : new \DateTimeImmutable(date('Y-m-d'));

        $branchId = (int) ($this->option('branch_id') ?? 0);
        $chunkSize = max(50, (int) ($this->option('chunk') ?? 500));
        $dryRun = (bool) $this->option('dry-run');

        $query = MicrofinanceLoanRequest::query()
            ->whereIn('status', ['approved', 'released'])
            ->whereNull('hold_at')
            ->whereNull('closed_at')
            ->orderBy('id');

        if ($branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        $processed = 0;
        $updated = 0;
        $totalAccruedInstallments = 0;

        $query->chunkById($chunkSize, function ($loans) use ($asOfDate, $dryRun, &$processed, &$updated, &$totalAccruedInstallments): void {
            foreach ($loans as $loan) {
                $processed++;

                $installmentAmount = (float) ($loan->installment_amount ?? 0);
                if ($installmentAmount <= 0) {
                    continue;
                }

                $refundOption = (string) ($loan->refund_option ?: 'month');
                $termCount = max((int) ($loan->terms_count ?? 1), 1);

                $dueCursor = $this->resolveScheduleCursor($loan, $refundOption, $termCount);
                if (!$dueCursor) {
                    continue;
                }

                $capDate = $asOfDate;
                if (!empty($loan->loan_end_date)) {
                    try {
                        $endDate = new \DateTimeImmutable((string) $loan->loan_end_date);
                        if ($endDate < $capDate) {
                            $capDate = $endDate;
                        }
                    } catch (\Throwable) {
                        // Ignore invalid loan_end_date.
                    }
                }

                $accruedInstallments = 0;
                $newArrears = (float) ($loan->arrears_balance ?? 0);
                $graceDays = max((int) ($loan->penalty_grace_days ?? 2), 0);

                // Accrue expected installments for all due cycles reached by as-of date.
                while (true) {
                    $graceEnd = $dueCursor->modify('+' . $graceDays . ' days');
                    if ($graceEnd > $capDate) {
                        break;
                    }

                    $newArrears += $installmentAmount;
                    $dueCursor = $this->shiftDateByRefundOption($dueCursor, $refundOption);
                    $accruedInstallments++;

                    // Safety guard against invalid schedules.
                    if ($accruedInstallments > 5000) {
                        break;
                    }
                }

                $nextDueDate = $dueCursor->format('Y-m-d');
                $penaltyStartsOn = $dueCursor->modify('+' . ($graceDays + 1) . ' days')->format('Y-m-d');

                $needsScheduleSync = (string) ($loan->due_date ?? '') !== $nextDueDate
                    || (string) ($loan->next_payment_date ?? '') !== $nextDueDate
                    || (string) ($loan->penalty_starts_on ?? '') !== $penaltyStartsOn;

                if ($accruedInstallments <= 0 && !$needsScheduleSync) {
                    continue;
                }

                if (!$dryRun) {
                    if ($accruedInstallments > 0) {
                        $loan->arrears_balance = round($newArrears, 2);
                    }
                    $loan->due_date = $nextDueDate;
                    $loan->next_payment_date = $nextDueDate;
                    $loan->penalty_starts_on = $penaltyStartsOn;
                    $loan->save();
                }

                $updated++;
                $totalAccruedInstallments += $accruedInstallments;
            }
        });

        $this->info(sprintf(
            'Microfinance arrears recalculation complete. processed=%d updated=%d accrued_installments=%d date=%s%s',
            $processed,
            $updated,
            $totalAccruedInstallments,
            $asOfDate->format('Y-m-d'),
            $dryRun ? ' (dry-run)' : ''
        ));

        return self::SUCCESS;
    }

    private function shiftDateByRefundOption(\DateTimeImmutable $date, string $refundOption, int $steps = 1): \DateTimeImmutable
    {
        if ($steps === 0) {
            return $date;
        }

        $interval = '+1 month';
        if ($refundOption === 'day') {
            $interval = '+1 day';
        } elseif ($refundOption === 'week') {
            $interval = '+7 days';
        }

        $cursor = $date;
        $iterations = abs($steps);

        for ($i = 0; $i < $iterations; $i++) {
            if ($steps > 0) {
                $cursor = $cursor->modify($interval);
            } else {
                $cursor = $cursor->modify(str_replace('+', '-', $interval));
            }
        }

        return $cursor;
    }

    private function resolveScheduleCursor(MicrofinanceLoanRequest $loan, string $refundOption, int $termCount): ?\DateTimeImmutable
    {
        if (!empty($loan->due_date)) {
            try {
                return new \DateTimeImmutable((string) $loan->due_date);
            } catch (\Throwable) {
                // fallthrough
            }
        }

        if (!empty($loan->next_payment_date)) {
            try {
                return new \DateTimeImmutable((string) $loan->next_payment_date);
            } catch (\Throwable) {
                // fallthrough
            }
        }

        if (!empty($loan->loan_request_date)) {
            try {
                $startDate = new \DateTimeImmutable((string) $loan->loan_request_date);
                return $this->shiftDateByRefundOption($startDate, $refundOption, 1);
            } catch (\Throwable) {
                // fallthrough
            }
        }

        if (!empty($loan->loan_end_date)) {
            try {
                $loanEndDate = new \DateTimeImmutable((string) $loan->loan_end_date);
                if ($termCount <= 1) {
                    return $loanEndDate;
                }

                return $this->shiftDateByRefundOption($loanEndDate, $refundOption, 0 - ($termCount - 1));
            } catch (\Throwable) {
                return null;
            }
        }

        return null;
    }
}
