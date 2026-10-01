<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class SmsGatewayService
{
    private const LOG_STATUS_SENT = 'sent';
    private const LOG_STATUS_FAILED = 'failed';

    /**
     * @return array<string, mixed>
     */
    public function getConfig(): array
    {
        if (!Schema::hasTable('system_settings')) {
            return [];
        }

        $raw = DB::table('system_settings')->where('key', 'sms_gateway_config')->value('value');
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @param array<string, mixed> $config
     */
    public function saveConfig(array $config): void
    {
        DB::table('system_settings')->updateOrInsert(
            ['key' => 'sms_gateway_config'],
            [
                'value' => json_encode($config, JSON_UNESCAPED_SLASHES),
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function sanitizedConfigForApi(): array
    {
        $config = $this->getConfig();
        return [
            'enabled' => (bool) ($config['enabled'] ?? false),
            'provider_code' => (string) ($config['provider_code'] ?? 'generic'),
            'provider_name' => (string) ($config['provider_name'] ?? ''),
            'endpoint_url' => (string) ($config['endpoint_url'] ?? ''),
            'http_method' => (string) ($config['http_method'] ?? 'POST'),
            'auth_type' => (string) ($config['auth_type'] ?? 'none'),
            'username' => (string) ($config['username'] ?? ''),
            'password' => (string) ($config['password'] ?? ''),
            'auth_token' => (string) ($config['auth_token'] ?? ''),
            'api_key_header' => (string) ($config['api_key_header'] ?? 'X-API-Key'),
            'api_key_value' => (string) ($config['api_key_value'] ?? ''),
            'sender_id' => (string) ($config['sender_id'] ?? ''),
            'smslenz_user_id' => (string) ($config['smslenz_user_id'] ?? ''),
            'smslenz_api_key' => (string) ($config['smslenz_api_key'] ?? ''),
            'timeout_seconds' => (int) ($config['timeout_seconds'] ?? 10),
            'message_template' => (string) ($config['message_template'] ?? ''),
            'loan_release_template' => (string) ($config['loan_release_template'] ?? ''),
            'mortgage_approval_template' => (string) ($config['mortgage_approval_template'] ?? ''),
            'birthday_template' => (string) ($config['birthday_template'] ?? ''),
            'otp_template' => (string) ($config['otp_template'] ?? ''),
            'deposit_template' => (string) ($config['deposit_template'] ?? ''),
            'withdrawal_template' => (string) ($config['withdrawal_template'] ?? ''),
        ];
    }

    /**
     * @return array{ok:bool,message:string,response_body?:string,status_code?:int}
     */
    public function send(string $phone, string $message, array $context = []): array
    {
        return $this->sendWithConfig($phone, $message, [], $context);
    }

    /**
     * @param array<string, mixed> $overrideConfig
     * @return array{ok:bool,message:string,response_body?:string,status_code?:int}
     */
    public function sendWithConfig(string $phone, string $message, array $overrideConfig = [], array $context = []): array
    {
        $config = array_merge($this->getConfig(), $overrideConfig);
        if (!($config['enabled'] ?? false)) {
            return $this->logAndReturnResult($phone, $message, [
                'ok' => false,
                'message' => 'SMS gateway is disabled.',
            ], $context);
        }

        $endpointUrl = trim((string) ($config['endpoint_url'] ?? ''));
        if ($endpointUrl === '') {
            return $this->logAndReturnResult($phone, $message, [
                'ok' => false,
                'message' => 'SMS gateway endpoint URL is not configured.',
            ], $context);
        }

        $cleanPhone = preg_replace('/\s+/', '', $phone) ?? '';
        if ($cleanPhone === '') {
            return $this->logAndReturnResult($phone, $message, [
                'ok' => false,
                'message' => 'Recipient phone number is empty.',
            ], $context);
        }

        $timeout = max(3, (int) ($config['timeout_seconds'] ?? 10));
        $method = strtoupper((string) ($config['http_method'] ?? 'POST'));
        $senderId = trim((string) ($config['sender_id'] ?? ''));
        $providerCode = strtolower(trim((string) ($config['provider_code'] ?? 'generic')));

        $payload = [
            'to' => $cleanPhone,
            'phone' => $cleanPhone,
            'message' => $message,
            'sender' => $senderId,
            'sender_id' => $senderId,
        ];

        if ($providerCode === 'smslenz') {
            $smsLenzUserId = trim((string) ($config['smslenz_user_id'] ?? $config['username'] ?? ''));
            $smsLenzApiKey = trim((string) ($config['smslenz_api_key'] ?? $config['api_key_value'] ?? ''));

            if ($smsLenzUserId === '' || $smsLenzApiKey === '') {
                return $this->logAndReturnResult($cleanPhone, $message, [
                    'ok' => false,
                    'message' => 'SMSLenz requires both user_id and api_key.',
                ], $context);
            }

            if ($senderId === '') {
                return $this->logAndReturnResult($cleanPhone, $message, [
                    'ok' => false,
                    'message' => 'SMSLenz requires sender_id (Sender ID Mask).',
                ], $context);
            }

            $smsLenzContact = preg_replace('/\D+/', '', $cleanPhone) ?? '';
            if (str_starts_with($smsLenzContact, '0') && strlen($smsLenzContact) === 10) {
                $smsLenzContact = '94' . substr($smsLenzContact, 1);
            } elseif (str_starts_with($smsLenzContact, '7') && strlen($smsLenzContact) === 9) {
                $smsLenzContact = '94' . $smsLenzContact;
            }

            if (!preg_match('/^94\d{9}$/', $smsLenzContact)) {
                return $this->logAndReturnResult($cleanPhone, $message, [
                    'ok' => false,
                    'message' => 'Invalid SMSLenz contact format. Use 94XXXXXXXXX or local mobile 07XXXXXXXX.',
                ], $context);
            }

            $payload = [
                'user_id' => $smsLenzUserId,
                'api_key' => $smsLenzApiKey,
                'sender_id' => $senderId,
                'contact' => $smsLenzContact,
                'contacts' => $smsLenzContact,
                'message' => $message,
            ];
        }

        $headers = ['Accept' => 'application/json,text/plain,*/*'];
        $authType = strtolower(trim((string) ($config['auth_type'] ?? 'none')));
        $http = Http::timeout($timeout)->withHeaders($headers);

        if ($authType === 'bearer' && trim((string) ($config['auth_token'] ?? '')) !== '') {
            $http = $http->withToken((string) $config['auth_token']);
        } elseif ($authType === 'basic' && trim((string) ($config['username'] ?? '')) !== '') {
            $http = $http->withBasicAuth(
                (string) ($config['username'] ?? ''),
                (string) ($config['password'] ?? '')
            );
        } elseif ($authType === 'api_key') {
            $headerName = trim((string) ($config['api_key_header'] ?? 'X-API-Key'));
            $headerValue = (string) ($config['api_key_value'] ?? '');
            if ($headerName !== '' && $headerValue !== '') {
                $http = $http->withHeaders([$headerName => $headerValue]);
            }
        }

        try {
            $response = $method === 'GET'
                ? $http->get($endpointUrl, $payload)
                : $http->post($endpointUrl, $payload);
        } catch (\Throwable $e) {
            Log::warning('SMS gateway request failed', ['error' => $e->getMessage()]);
            return $this->logAndReturnResult($cleanPhone, $message, [
                'ok' => false,
                'message' => 'SMS gateway connection failed: ' . $e->getMessage(),
            ], $context);
        }

        if (!$response->successful()) {
            $responsePayload = $response->json();
            $providerMessage = '';
            if (is_array($responsePayload)) {
                $providerMessage = (string) (
                    $responsePayload['message']
                    ?? $responsePayload['error']
                    ?? $responsePayload['details']
                    ?? ''
                );
            }

            return $this->logAndReturnResult($cleanPhone, $message, [
                'ok' => false,
                'message' => $providerMessage !== ''
                    ? 'SMS gateway returned an error response: ' . $providerMessage
                    : 'SMS gateway returned an error response.',
                'status_code' => $response->status(),
                'response_body' => $response->body(),
            ], $context);
        }

        return $this->logAndReturnResult($cleanPhone, $message, [
            'ok' => true,
            'message' => 'SMS sent successfully.',
            'status_code' => $response->status(),
            'response_body' => $response->body(),
        ], $context);
    }

    /**
     * @param array{ok:bool,message:string,response_body?:string,status_code?:int} $result
     * @param array<string, mixed> $context
     * @return array{ok:bool,message:string,response_body?:string,status_code?:int}
     */
    private function logAndReturnResult(string $phone, string $message, array $result, array $context = []): array
    {
        try {
            if (Schema::hasTable('sms_message_logs')) {
                $normalizedPhone = preg_replace('/\s+/', '', $phone) ?? '';
                $status = (bool) ($result['ok'] ?? false) ? self::LOG_STATUS_SENT : self::LOG_STATUS_FAILED;
                $module = trim((string) ($context['module'] ?? 'General'));
                if ($module === '') {
                    $module = 'General';
                }

                $providerBody = isset($result['response_body']) ? (string) $result['response_body'] : '';
                DB::table('sms_message_logs')->insert([
                    'branch_id' => isset($context['branch_id']) && is_numeric($context['branch_id']) ? (int) $context['branch_id'] : null,
                    'user_id' => isset($context['user_id']) && is_numeric($context['user_id']) ? (int) $context['user_id'] : null,
                    'module' => mb_substr($module, 0, 80),
                    'reference' => mb_substr(trim((string) ($context['reference'] ?? '')), 0, 120),
                    'customer_name' => mb_substr(trim((string) ($context['customer_name'] ?? '')), 0, 160),
                    'phone' => mb_substr(trim((string) $normalizedPhone), 0, 30),
                    'message' => (string) $message,
                    'status' => $status,
                    'error_message' => $status === self::LOG_STATUS_FAILED ? mb_substr((string) ($result['message'] ?? ''), 0, 500) : null,
                    'provider_status_code' => isset($result['status_code']) && is_numeric($result['status_code'])
                        ? (int) $result['status_code']
                        : null,
                    'provider_response' => $providerBody !== '' ? mb_substr($providerBody, 0, 5000) : null,
                    'sent_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        } catch (\Throwable $exception) {
            Log::warning('Failed to persist SMS message log', ['error' => $exception->getMessage()]);
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $context
     */
    public function buildCollectionMessage(array $context): string
    {
        $defaults = [
            'customer_name' => (string) ($context['customer_name'] ?? 'Customer'),
            'amount' => (string) ($context['amount'] ?? '0.00'),
            'date' => (string) ($context['date'] ?? now()->toDateString()),
            'reference' => (string) ($context['reference'] ?? '-'),
            'module' => (string) ($context['module'] ?? 'Collection'),
        ];

        return $this->buildMessageFromTemplate(
            'message_template',
            'Dear {{customer_name}}, we received your {{module}} payment of LKR {{amount}} on {{date}}. Ref: {{reference}}',
            $defaults
        );
    }

    /**
     * @param array<string, mixed> $context
     */
    public function buildLoanReleaseMessage(array $context): string
    {
        return $this->buildMessageFromTemplate(
            'loan_release_template',
            'Dear {{customer_name}}, your {{module}} loan has been released. Amount: LKR {{amount}} on {{date}}. Ref: {{reference}}',
            [
                'customer_name' => (string) ($context['customer_name'] ?? 'Customer'),
                'module' => (string) ($context['module'] ?? 'Loan'),
                'amount' => (string) ($context['amount'] ?? '0.00'),
                'date' => (string) ($context['date'] ?? now()->toDateString()),
                'reference' => (string) ($context['reference'] ?? '-'),
            ]
        );
    }

    /**
     * @param array<string, mixed> $context
     */
    public function buildMortgageApprovalMessage(array $context): string
    {
        return $this->buildMessageFromTemplate(
            'mortgage_approval_template',
            'Dear {{customer_name}}, your mortgage request has been approved. Amount: LKR {{amount}} on {{date}}. Ref: {{reference}}',
            [
                'customer_name' => (string) ($context['customer_name'] ?? 'Customer'),
                'module' => (string) ($context['module'] ?? 'Mortgage'),
                'amount' => (string) ($context['amount'] ?? '0.00'),
                'date' => (string) ($context['date'] ?? now()->toDateString()),
                'reference' => (string) ($context['reference'] ?? '-'),
            ]
        );
    }

    /**
     * @param array<string, mixed> $context
     */
    public function buildBirthdayWishesMessage(array $context): string
    {
        return $this->buildMessageFromTemplate(
            'birthday_template',
            'Happy Birthday {{customer_name}}! Wishing you health, happiness, and success. - {{app_name}}',
            [
                'customer_name' => (string) ($context['customer_name'] ?? 'Customer'),
                'app_name' => (string) ($context['app_name'] ?? config('app.name', 'Our Team')),
                'date' => (string) ($context['date'] ?? now()->toDateString()),
            ]
        );
    }

    /**
     * @param array<string, mixed> $context
     */
    public function buildOtpMessage(array $context): string
    {
        return $this->buildMessageFromTemplate(
            'otp_template',
            'Dear {{customer_name}}, your OTP is {{otp_code}}. It expires in {{expiry_minutes}} minutes. Do not share this code.',
            [
                'customer_name' => (string) ($context['customer_name'] ?? 'Customer'),
                'otp_code' => (string) ($context['otp_code'] ?? ''),
                'expiry_minutes' => (string) ($context['expiry_minutes'] ?? '5'),
                'app_name' => (string) ($context['app_name'] ?? config('app.name', 'Our App')),
            ]
        );
    }

    /**
     * @param array<string, mixed> $context
     */
    public function buildDepositMessage(array $context): string
    {
        return $this->buildMessageFromTemplate(
            'deposit_template',
            'Dear {{customer_name}}, we received your deposit of LKR {{amount}} on {{date}}. Ref: {{reference}}. Thank you.',
            [
                'customer_name' => (string) ($context['customer_name'] ?? 'Customer'),
                'amount' => (string) ($context['amount'] ?? '0.00'),
                'date' => (string) ($context['date'] ?? now()->toDateString()),
                'reference' => (string) ($context['reference'] ?? '-'),
                'module' => (string) ($context['module'] ?? 'Deposit'),
            ]
        );
    }

    /**
     * @param array<string, mixed> $context
     */
    public function buildWithdrawalMessage(array $context): string
    {
        return $this->buildMessageFromTemplate(
            'withdrawal_template',
            'Dear {{customer_name}}, your withdrawal of LKR {{amount}} was processed on {{date}}. Ref: {{reference}}.',
            [
                'customer_name' => (string) ($context['customer_name'] ?? 'Customer'),
                'amount' => (string) ($context['amount'] ?? '0.00'),
                'date' => (string) ($context['date'] ?? now()->toDateString()),
                'reference' => (string) ($context['reference'] ?? '-'),
                'module' => (string) ($context['module'] ?? 'Withdrawal'),
            ]
        );
    }

    /**
     * @param array<string, mixed> $defaults
     */
    private function buildMessageFromTemplate(string $templateKey, string $fallbackTemplate, array $defaults): string
    {
        $config = $this->getConfig();
        $template = trim((string) ($config[$templateKey] ?? ''));
        if ($template === '') {
            $template = $fallbackTemplate;
        }

        $message = $template;
        foreach ($defaults as $key => $value) {
            $message = str_replace('{{' . $key . '}}', (string) $value, $message);
        }

        return $message;
    }
}

