<?php

namespace App\Console\Commands;

use App\Models\SavingsAccount;
use App\Models\SavingsAccountTransaction;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ApplyMonthlySavingsInterest extends Command
{
    private const SAVINGS_SETTINGS_KEY = 'savings_deposits_settings';

    protected $signature = 'savings:apply-monthly-interest {--date=} {--force : Run even if date is not month-end}';

    protected $description = 'Apply monthly interest to savings/fixed deposit accounts on month end';

    /**
     * @return array<string, float>
     */
    private function defaultInterestRates(): array
    {
        $defaults = [
            'savings' => 4.5,
            'current' => 0.0,
            'fixed_deposit' => 10.5,
            'investment' => 12.0,
        ];

        if (!Schema::hasTable('system_settings')) {
            return $defaults;
        }

        $rawValue = DB::table('system_settings')
            ->where('key', self::SAVINGS_SETTINGS_KEY)
            ->value('value');

        if (!is_string($rawValue) || trim($rawValue) === '') {
            return $defaults;
        }

        $decoded = json_decode($rawValue, true);
        if (!is_array($decoded)) {
            return $defaults;
        }

        $matrix = is_array($decoded['default_interest_rates'] ?? null)
            ? $decoded['default_interest_rates']
            : [];

        foreach ($defaults as $accountType => $fallbackRate) {
            $rate = (float) ($matrix[$accountType] ?? $fallbackRate);
            $defaults[$accountType] = round(max($rate, 0), 4);
        }

        return $defaults;
    }

    public function handle(): int
    {
        $asOfDate = $this->option('date')
            ? Carbon::parse((string) $this->option('date'))->endOfDay()
            : Carbon::now()->endOfDay();

        $isMonthEnd = $asOfDate->isSameDay($asOfDate->copy()->endOfMonth());
        if (!$isMonthEnd && !$this->option('force')) {
            $this->info('Skipped: today is not month-end. Use --force to run manually.');
            return self::SUCCESS;
        }

        $periodKey = $asOfDate->format('Ym');
        $transactionDate = $asOfDate->toDateString();
        $defaultRates = $this->defaultInterestRates();

        $eligibleAccounts = SavingsAccount::query()
            ->where('status', 'active')
            ->whereIn('account_type', ['savings', 'current', 'fixed_deposit', 'investment'])
            ->where('balance', '>', 0)
            ->orderBy('id')
            ->get();

        $credited = 0;
        $skipped = 0;

        foreach ($eligibleAccounts as $account) {
            /** @var \App\Models\SavingsAccount $account */
            $alreadyCredited = SavingsAccountTransaction::query()
                ->where('savings_account_id', $account->id)
                ->where('transaction_type', 'interest_credit')
                ->where('reference_no', 'INT-' . $periodKey)
                ->exists();

            if ($alreadyCredited) {
                $skipped++;
                continue;
            }

            $accountType = strtolower(trim((string) $account->account_type));
            $annualRatePercent = (float) ($defaultRates[$accountType] ?? 0.0);
            if ($annualRatePercent <= 0) {
                $skipped++;
                continue;
            }

            $balanceBefore = round((float) $account->balance, 2);
            $monthlyRate = ($annualRatePercent / 100) / 12;
            $interestAmount = round($balanceBefore * $monthlyRate, 2);

            if ($interestAmount <= 0) {
                $skipped++;
                continue;
            }

            DB::transaction(function () use ($account, $balanceBefore, $interestAmount, $transactionDate, $periodKey, $annualRatePercent) {
                $balanceAfter = round($balanceBefore + $interestAmount, 2);

                SavingsAccountTransaction::create([
                    'savings_account_id' => $account->id,
                    'transaction_type' => 'interest_credit',
                    'amount' => $interestAmount,
                    'balance_before' => $balanceBefore,
                    'balance_after' => $balanceAfter,
                    'transaction_date' => $transactionDate,
                    'reference_no' => 'INT-' . $periodKey,
                    'note' => 'Auto month-end interest credit @ ' . number_format($annualRatePercent, 4, '.', '') . '% p.a. (default matrix)',
                    'created_by' => null,
                ]);

                $account->balance = $balanceAfter;
                $account->save();
            });

            $credited++;
        }

        $this->info("Monthly interest process completed. Credited: {$credited}, Skipped: {$skipped}");

        return self::SUCCESS;
    }
}
