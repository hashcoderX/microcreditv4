<?php

declare(strict_types=1);

use App\Services\SmsGatewayService;
use Illuminate\Contracts\Console\Kernel;

require __DIR__ . '/../vendor/autoload.php';

$app = require __DIR__ . '/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$phone = $argv[1] ?? '';
if (!is_string($phone) || trim($phone) === '') {
    fwrite(STDERR, "Usage: php scripts/send_test_sms.php <phone> [message]\n");
    exit(1);
}

$message = $argv[2] ?? ('Test SMS from collection module at ' . date('Y-m-d H:i:s'));

/** @var SmsGatewayService $smsService */
$smsService = app(SmsGatewayService::class);
$result = $smsService->send((string) $phone, (string) $message);

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;

exit(($result['ok'] ?? false) ? 0 : 2);
