<?php

declare(strict_types=1);

use App\Services\SmsGatewayService;
use Illuminate\Contracts\Console\Kernel;

require __DIR__ . '/../vendor/autoload.php';

$app = require __DIR__ . '/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

/** @var SmsGatewayService $smsService */
$smsService = app(SmsGatewayService::class);
$config = $smsService->getConfig();
$config['enabled'] = true;
$smsService->saveConfig($config);

echo json_encode([
    'enabled' => (bool) ($smsService->sanitizedConfigForApi()['enabled'] ?? false),
    'provider_code' => (string) ($smsService->sanitizedConfigForApi()['provider_code'] ?? ''),
    'endpoint_url' => (string) ($smsService->sanitizedConfigForApi()['endpoint_url'] ?? ''),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
