<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SavingsDepositsSettingsController extends Controller
{
    private const SETTINGS_KEY = 'savings_deposits_settings';

    /** @var list<string> */
    private const ACCOUNT_TYPES = ['savings', 'current', 'fixed_deposit', 'investment'];

    /** @var list<string> */
    private const INTEREST_TYPES = [
        'simple_interest',
        'compound_interest',
        'monthly_payout',
        'quarterly_payout',
        'annual_payout',
        'maturity_payout',
        'tiered_interest',
        'auto_sweep_interest',
    ];

    /**
     * @return array<string, mixed>
     */
    private function defaultConfig(): array
    {
        return [
            'minimum_hold_amount' => 0.0,
            'minimum_opening_deposit' => 0.0,
            'maximum_daily_withdrawal_amount' => 0.0,
            'withdrawal_requires_reference' => false,
            'auto_apply_default_interest' => true,
            'allow_early_fixed_deposit_withdrawal' => true,
            'fixed_deposit_lock_months' => 12,
            'interest_posting_frequency' => 'monthly',
            'default_interest_rates' => [
                'savings' => 4.50,
                'current' => 0.00,
                'fixed_deposit' => 10.50,
                'investment' => 12.00,
            ],
            'default_interest_types' => [
                'savings' => 'simple_interest',
                'current' => 'simple_interest',
                'fixed_deposit' => 'maturity_payout',
                'investment' => 'compound_interest',
            ],
        ];
    }

    /**
     * @param array<string, mixed> $config
     * @return array<string, mixed>
     */
    private function normalizeConfig(array $config): array
    {
        $defaults = $this->defaultConfig();

        $rates = is_array($config['default_interest_rates'] ?? null)
            ? $config['default_interest_rates']
            : [];
        $types = is_array($config['default_interest_types'] ?? null)
            ? $config['default_interest_types']
            : [];

        $normalizedRates = [];
        $normalizedTypes = [];
        foreach (self::ACCOUNT_TYPES as $accountType) {
            $rate = array_key_exists($accountType, $rates)
                ? (float) $rates[$accountType]
                : (float) $defaults['default_interest_rates'][$accountType];
            $normalizedRates[$accountType] = round(max($rate, 0), 4);

            $type = strtolower(trim((string) ($types[$accountType] ?? $defaults['default_interest_types'][$accountType])));
            if (!in_array($type, self::INTEREST_TYPES, true)) {
                $type = (string) $defaults['default_interest_types'][$accountType];
            }
            $normalizedTypes[$accountType] = $type;
        }

        $frequency = strtolower(trim((string) ($config['interest_posting_frequency'] ?? $defaults['interest_posting_frequency'])));
        if (!in_array($frequency, ['monthly', 'quarterly', 'semi_annual', 'annual', 'maturity'], true)) {
            $frequency = (string) $defaults['interest_posting_frequency'];
        }

        return [
            'minimum_hold_amount' => round(max((float) ($config['minimum_hold_amount'] ?? $defaults['minimum_hold_amount']), 0), 2),
            'minimum_opening_deposit' => round(max((float) ($config['minimum_opening_deposit'] ?? $defaults['minimum_opening_deposit']), 0), 2),
            'maximum_daily_withdrawal_amount' => round(max((float) ($config['maximum_daily_withdrawal_amount'] ?? $defaults['maximum_daily_withdrawal_amount']), 0), 2),
            'withdrawal_requires_reference' => (bool) ($config['withdrawal_requires_reference'] ?? $defaults['withdrawal_requires_reference']),
            'auto_apply_default_interest' => (bool) ($config['auto_apply_default_interest'] ?? $defaults['auto_apply_default_interest']),
            'allow_early_fixed_deposit_withdrawal' => (bool) ($config['allow_early_fixed_deposit_withdrawal'] ?? $defaults['allow_early_fixed_deposit_withdrawal']),
            'fixed_deposit_lock_months' => max(0, min((int) ($config['fixed_deposit_lock_months'] ?? $defaults['fixed_deposit_lock_months']), 600)),
            'interest_posting_frequency' => $frequency,
            'default_interest_rates' => $normalizedRates,
            'default_interest_types' => $normalizedTypes,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function readConfig(): array
    {
        $defaults = $this->defaultConfig();

        if (!Schema::hasTable('system_settings')) {
            return $defaults;
        }

        $value = DB::table('system_settings')
            ->where('key', self::SETTINGS_KEY)
            ->value('value');

        if (!is_string($value) || trim($value) === '') {
            return $defaults;
        }

        $decoded = json_decode($value, true);
        if (!is_array($decoded)) {
            return $defaults;
        }

        return $this->normalizeConfig($decoded);
    }

    /**
     * @param array<string, mixed> $config
     */
    private function writeConfig(array $config): void
    {
        DB::table('system_settings')->updateOrInsert(
            ['key' => self::SETTINGS_KEY],
            [
                'value' => json_encode($this->normalizeConfig($config), JSON_UNESCAPED_SLASHES),
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );
    }

    private function canManageSavingsSettings(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        if (method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin()) {
            return true;
        }

        $matchesKeyword = static function (string $value): bool {
            $normalized = strtolower(trim($value));
            if ($normalized === '') {
                return false;
            }

            return str_contains($normalized, 'admin')
                || str_contains($normalized, 'manager')
                || str_contains($normalized, 'operation')
                || str_contains($normalized, 'bank');
        };

        $designationName = (string) optional($user->designation)->name;
        if ($matchesKeyword($designationName)) {
            return true;
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            if ($matchesKeyword((string) $roleName)) {
                return true;
            }
        }

        return false;
    }

    public function show(Request $request): JsonResponse
    {
        if (!$this->canManageSavingsSettings($request->user())) {
            return response()->json([
                'message' => 'Only authorized operations managers can view savings settings.',
            ], 403);
        }

        return response()->json([
            'config' => $this->readConfig(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        if (!$this->canManageSavingsSettings($request->user())) {
            return response()->json([
                'message' => 'Only authorized operations managers can update savings settings.',
            ], 403);
        }

        if (!Schema::hasTable('system_settings')) {
            return response()->json([
                'message' => 'System settings table is not available.',
            ], 422);
        }

        $validated = $request->validate([
            'minimum_hold_amount' => ['required', 'numeric', 'min:0', 'max:999999999'],
            'minimum_opening_deposit' => ['required', 'numeric', 'min:0', 'max:999999999'],
            'maximum_daily_withdrawal_amount' => ['required', 'numeric', 'min:0', 'max:999999999'],
            'withdrawal_requires_reference' => ['required', 'boolean'],
            'auto_apply_default_interest' => ['required', 'boolean'],
            'allow_early_fixed_deposit_withdrawal' => ['required', 'boolean'],
            'fixed_deposit_lock_months' => ['required', 'integer', 'min:0', 'max:600'],
            'interest_posting_frequency' => ['required', 'in:monthly,quarterly,semi_annual,annual,maturity'],
            'default_interest_rates' => ['required', 'array'],
            'default_interest_rates.savings' => ['required', 'numeric', 'min:0', 'max:100'],
            'default_interest_rates.current' => ['required', 'numeric', 'min:0', 'max:100'],
            'default_interest_rates.fixed_deposit' => ['required', 'numeric', 'min:0', 'max:100'],
            'default_interest_rates.investment' => ['required', 'numeric', 'min:0', 'max:100'],
            'default_interest_types' => ['required', 'array'],
            'default_interest_types.savings' => ['required', 'in:' . implode(',', self::INTEREST_TYPES)],
            'default_interest_types.current' => ['required', 'in:' . implode(',', self::INTEREST_TYPES)],
            'default_interest_types.fixed_deposit' => ['required', 'in:' . implode(',', self::INTEREST_TYPES)],
            'default_interest_types.investment' => ['required', 'in:' . implode(',', self::INTEREST_TYPES)],
        ]);

        $this->writeConfig($validated);

        return response()->json([
            'message' => 'Savings settings updated successfully.',
            'config' => $this->readConfig(),
        ]);
    }
}
