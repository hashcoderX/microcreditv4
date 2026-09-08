<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Carbon\Carbon;
use App\Models\Employee;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class AttendanceController extends Controller
{
    private function getFingerprintConfig(): array
    {
        if (!Schema::hasTable('system_settings')) {
            return [];
        }

        $raw = DB::table('system_settings')->where('key', 'attendance_fingerprint_config')->value('value');
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function saveFingerprintConfig(array $config): void
    {
        DB::table('system_settings')->updateOrInsert(
            ['key' => 'attendance_fingerprint_config'],
            [
                'value' => json_encode($config, JSON_UNESCAPED_SLASHES),
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );
    }

    private function normalizeTimeValue(?string $value): ?string
    {
        $raw = trim((string) $value);
        if ($raw === '') {
            return null;
        }

        try {
            return Carbon::parse($raw)->format('H:i:s');
        } catch (\Throwable) {
            if (preg_match('/^\d{2}:\d{2}$/', $raw)) {
                return $raw . ':00';
            }
            if (preg_match('/^\d{2}:\d{2}:\d{2}$/', $raw)) {
                return $raw;
            }
        }

        return null;
    }

    /**
     * @return array{date:string|null,in_time:string|null,out_time:string|null,status:string|null,employee_code:string|null,employee_id:int|null}
     */
    private function normalizeFingerprintRow(array $row): array
    {
        $dateCandidate = (string) ($row['date'] ?? $row['attendance_date'] ?? '');
        $timestampCandidate = (string) ($row['timestamp'] ?? $row['check_time'] ?? '');

        $date = null;
        if (trim($dateCandidate) !== '') {
            try {
                $date = Carbon::parse($dateCandidate)->toDateString();
            } catch (\Throwable) {
                $date = null;
            }
        }
        if (!$date && trim($timestampCandidate) !== '') {
            try {
                $date = Carbon::parse($timestampCandidate)->toDateString();
            } catch (\Throwable) {
                $date = null;
            }
        }

        $inTime = $this->normalizeTimeValue((string) ($row['in_time'] ?? $row['check_in'] ?? ''));
        $outTime = $this->normalizeTimeValue((string) ($row['out_time'] ?? $row['check_out'] ?? ''));

        if (!$inTime && trim($timestampCandidate) !== '') {
            $inTime = $this->normalizeTimeValue($timestampCandidate);
        }

        $statusRaw = strtolower(trim((string) ($row['status'] ?? '')));
        $status = in_array($statusRaw, ['present', 'absent', 'late', 'half_day'], true)
            ? $statusRaw
            : ($inTime || $outTime ? 'present' : null);

        $employeeCode = trim((string) ($row['employee_code'] ?? $row['employee_id'] ?? $row['emp_code'] ?? ''));
        $employeeId = isset($row['employee_db_id']) ? (int) $row['employee_db_id'] : null;

        return [
            'date' => $date,
            'in_time' => $inTime,
            'out_time' => $outTime,
            'status' => $status,
            'employee_code' => $employeeCode !== '' ? $employeeCode : null,
            'employee_id' => $employeeId && $employeeId > 0 ? $employeeId : null,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function parseFingerprintPayload(string $body): array
    {
        $trimmed = trim($body);
        if ($trimmed === '') {
            return [];
        }

        $decoded = json_decode($trimmed, true);
        if (is_array($decoded)) {
            $rows = $decoded['data'] ?? $decoded['logs'] ?? $decoded;
            if (is_array($rows)) {
                return array_values(array_filter($rows, fn ($row) => is_array($row)));
            }
        }

        $lines = preg_split('/\r\n|\r|\n/', $trimmed) ?: [];
        if (count($lines) < 2) {
            return [];
        }

        $header = array_map(
            fn ($col) => strtolower(trim((string) $col)),
            str_getcsv((string) array_shift($lines))
        );

        $rows = [];
        foreach ($lines as $line) {
            if (trim($line) === '') continue;
            $values = str_getcsv($line);
            if (count($values) !== count($header)) continue;
            $rows[] = array_combine($header, $values);
        }

        return array_values(array_filter($rows, fn ($row) => is_array($row)));
    }

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->input('tenant_id');
        $branchId = $request->input('branch_id');
        $month = $request->input('month'); // YYYY-MM
        $date = $request->input('date'); // YYYY-MM-DD

        $query = Attendance::with('employee');

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        if ($month) {
            $query->whereRaw("DATE_FORMAT(date, '%Y-%m') = ?", [$month]);
        }

        if ($date) {
            $query->where('date', $date);
        }

        $attendance = $query->paginate(15);

        return response()->json($attendance);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tenant_id' => 'required|exists:companies,id',
            'branch_id' => 'required|exists:companies,id',
            'employee_id' => 'required|exists:employees,id',
            'date' => 'required|date',
            'in_time' => 'nullable|date_format:H:i',
            'out_time' => 'nullable|date_format:H:i|after:in_time',
            'status' => 'required|in:present,absent,late,half_day',
            'notes' => 'nullable|string',
        ]);

        // Calculate work hours if both times are present
        if ($validated['in_time'] && $validated['out_time']) {
            $inTime = Carbon::createFromFormat('H:i', $validated['in_time']);
            $outTime = Carbon::createFromFormat('H:i', $validated['out_time']);
            $validated['work_hours'] = $outTime->diffInHours($inTime, true);
        }

        $attendance = Attendance::create($validated);

        return response()->json($attendance->load('employee'), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Attendance $attendance): JsonResponse
    {
        return response()->json($attendance->load('employee'));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Attendance $attendance): JsonResponse
    {
        $validated = $request->validate([
            'in_time' => 'nullable|date_format:H:i',
            'out_time' => 'nullable|date_format:H:i|after:in_time',
            'status' => 'sometimes|required|in:present,absent,late,half_day',
            'notes' => 'nullable|string',
        ]);

        // Recalculate work hours
        if (isset($validated['in_time']) && isset($validated['out_time'])) {
            $inTime = Carbon::createFromFormat('H:i', $validated['in_time']);
            $outTime = Carbon::createFromFormat('H:i', $validated['out_time']);
            $validated['work_hours'] = $outTime->diffInHours($inTime, true);
        }

        $attendance->update($validated);

        return response()->json($attendance->load('employee'));
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Attendance $attendance): JsonResponse
    {
        $attendance->delete();

        return response()->json(['message' => 'Attendance record deleted successfully']);
    }

    /**
     * Get monthly attendance report
     */
    public function monthlyReport(Request $request): JsonResponse
    {
        $request->validate([
            'tenant_id' => 'required|exists:companies,id',
            'branch_id' => 'sometimes|exists:companies,id',
            'month' => 'required|date_format:Y-m',
        ]);

        $tenantId = $request->tenant_id;
        $branchId = $request->branch_id;
        $month = $request->month;

        $query = Attendance::where('tenant_id', $tenantId)
            ->whereRaw("DATE_FORMAT(date, '%Y-%m') = ?", [$month])
            ->with('employee');

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        $attendanceRecords = $query->get();

        $report = $attendanceRecords->groupBy('employee_id')->map(function ($records, $employeeId) {
            $employee = $records->first()->employee;
            $totalDays = $records->count();
            $presentDays = $records->where('status', 'present')->count();
            $absentDays = $records->where('status', 'absent')->count();
            $lateDays = $records->where('status', 'late')->count();
            $totalHours = $records->sum('work_hours');

            return [
                'employee' => $employee,
                'total_days' => $totalDays,
                'present_days' => $presentDays,
                'absent_days' => $absentDays,
                'late_days' => $lateDays,
                'total_hours' => $totalHours,
                'attendance_percentage' => $totalDays > 0 ? round(($presentDays / $totalDays) * 100, 2) : 0,
            ];
        })->values();

        return response()->json([
            'month' => $month,
            'report' => $report,
        ]);
    }

    /**
     * Basic mark attendance: minimal payload, easy to operate.
     */
    public function markBasic(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'employee_id' => 'required|exists:employees,id',
                'status' => 'required|in:present,absent,late,half_day',
                'date' => 'nullable|date',
                'in_time' => 'nullable|date_format:H:i',
                'notes' => 'nullable|string',
            ]);

            $employee = Employee::findOrFail($validated['employee_id']);
            $date = $validated['date'] ?? Carbon::today()->toDateString();

            // Check if attendance already exists for this employee on this date
            $existingAttendance = Attendance::where('employee_id', $employee->id)
                ->where('date', $date)
                ->first();

            if ($existingAttendance) {
                return response()->json([
                    'error' => 'Attendance already marked',
                    'message' => 'This employee has already been marked for attendance on ' . $date,
                    'existing_record' => $existingAttendance->load('employee')
                ], 409); // Conflict status code
            }

            // Ensure branch_id exists, default to first available company
            $branchId = $employee->branch_id;
            if (!$branchId || !DB::table('companies')->where('id', $branchId)->exists()) {
                $firstCompany = DB::table('companies')->first();
                if ($firstCompany) {
                    $branchId = $firstCompany->id;
                } else {
                    return response()->json([
                        'error' => 'No companies found',
                        'message' => 'Please create at least one company before marking attendance'
                    ], 400);
                }
            }

            $tenantId = $branchId; // Use the same for tenant

            $data = [
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
                'employee_id' => $employee->id,
                'date' => $date,
                'status' => $validated['status'],
                'notes' => $validated['notes'] ?? null,
                'in_time' => $validated['in_time'] ?? null,
                'work_hours' => null,
            ];

            // Calculate work hours if both in_time and out_time are provided
            // Note: out_time is not set in markBasic, only in markOut
            if ($validated['in_time'] && false) { // Always false since we don't set out_time in markBasic
                $inTime = Carbon::createFromFormat('H:i', $validated['in_time']);
                $outTime = Carbon::createFromFormat('H:i', $validated['out_time']);
                $workHours = $outTime->diffInMinutes($inTime) / 60;
                $data['work_hours'] = round($workHours, 2);
            }

            $attendance = Attendance::create($data);

            return response()->json($attendance->load('employee'), 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'error' => 'Validation failed',
                'message' => 'Invalid input data',
                'errors' => $e->errors()
            ], 422);
        } catch (\Illuminate\Database\QueryException $e) {
            // Handle database constraint violations
            if ($e->getCode() == 23000) { // Integrity constraint violation
                return response()->json([
                    'error' => 'Database constraint violation',
                    'message' => 'Attendance record already exists or foreign key constraint failed'
                ], 409);
            }
            return response()->json([
                'error' => 'Database error',
                'message' => $e->getMessage()
            ], 500);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Internal server error',
                'message' => $e->getMessage(),
                'line' => $e->getLine(),
                'file' => $e->getFile()
            ], 500);
        }
    }

    /**
     * Upload CSV file to bulk mark attendance
     */
    public function uploadCsv(Request $request): JsonResponse
    {
        $request->validate([
            'csv_file' => 'required|file|mimes:csv,txt|max:2048', // 2MB max
        ]);

        $file = $request->file('csv_file');
        $path = $file->getRealPath();
        $data = array_map('str_getcsv', file($path));

        if (empty($data)) {
            return response()->json(['error' => 'CSV file is empty'], 400);
        }

        $header = array_shift($data); // Remove header row
        $header = array_map('strtolower', $header); // Normalize to lowercase

        // Expected headers: employee_code, date, in_time, out_time, status, notes
        $expectedHeaders = ['employee_code', 'date', 'in_time', 'out_time', 'status', 'notes'];
        $missingHeaders = array_diff($expectedHeaders, $header);
        if (!empty($missingHeaders)) {
            return response()->json(['error' => 'Missing required headers: ' . implode(', ', $missingHeaders)], 400);
        }

        $createdRecords = [];
        $errors = [];

        foreach ($data as $rowIndex => $row) {
            if (count($row) !== count($header)) {
                $errors[] = "Row " . ($rowIndex + 2) . ": Column count mismatch";
                continue;
            }

            $rowData = array_combine($header, $row);

            // Find employee by code
            $employee = Employee::where('employee_code', $rowData['employee_code'])->first();
            if (!$employee) {
                $errors[] = "Row " . ($rowIndex + 2) . ": Employee code {$rowData['employee_code']} not found";
                continue;
            }

            // Validate status
            $validStatuses = ['present', 'absent', 'late', 'half_day'];
            if (!in_array($rowData['status'], $validStatuses)) {
                $errors[] = "Row " . ($rowIndex + 2) . ": Invalid status {$rowData['status']}";
                continue;
            }

            // Prepare data
            $attendanceData = [
                'tenant_id' => 1, // default tenant
                'branch_id' => $employee->branch_id,
                'employee_id' => $employee->id,
                'date' => $rowData['date'],
                'status' => $rowData['status'],
                'notes' => $rowData['notes'] ?? null,
            ];

            if (!empty($rowData['in_time'])) {
                $attendanceData['in_time'] = $rowData['in_time'];
            }

            if (!empty($rowData['out_time'])) {
                $attendanceData['out_time'] = $rowData['out_time'];
            }

            if (!empty($attendanceData['in_time']) && !empty($attendanceData['out_time'])) {
                try {
                    $inTime = Carbon::createFromFormat('H:i', $attendanceData['in_time']);
                    $outTime = Carbon::createFromFormat('H:i', $attendanceData['out_time']);
                    $attendanceData['work_hours'] = $outTime->diffInHours($inTime, true);
                } catch (\Exception $e) {
                    $errors[] = "Row " . ($rowIndex + 2) . ": Invalid time format";
                    continue;
                }
            }

            try {
                $attendance = Attendance::create($attendanceData);
                $createdRecords[] = $attendance->load('employee');
            } catch (\Exception $e) {
                $errors[] = "Row " . ($rowIndex + 2) . ": Failed to create record - " . $e->getMessage();
            }
        }

        return response()->json([
            'message' => 'CSV upload processed',
            'created_records' => count($createdRecords),
            'errors' => $errors,
            'data' => $createdRecords,
        ], 200);
    }

    /**
     * Get attendance history for a specific employee
     */
    public function getEmployeeAttendance(Request $request, $employeeId): JsonResponse
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
        ]);

        $employee = Employee::findOrFail($employeeId);

        $query = Attendance::where('employee_id', $employeeId)->with('employee');

        if ($request->start_date) {
            $query->where('date', '>=', $request->start_date);
        }

        if ($request->end_date) {
            $query->where('date', '<=', $request->end_date);
        }

        $attendance = $query->orderBy('date', 'desc')->get();

        return response()->json([
            'employee' => $employee,
            'attendance' => $attendance,
        ]);
    }

    /**
     * Mark out time for existing attendance record
     */
    public function markOut(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'employee_id' => 'required|exists:employees,id',
                'out_time' => 'required|date_format:H:i',
                'date' => 'nullable|date',
                'notes' => 'nullable|string',
            ]);

            $employee = Employee::findOrFail($validated['employee_id']);
            $date = $validated['date'] ?? Carbon::today()->toDateString();

            // Find existing attendance record for this employee on this date
            $attendance = Attendance::where('employee_id', $employee->id)
                ->where('date', $date)
                ->first();

            if (!$attendance) {
                Log::info('Mark out failed: No attendance record found', [
                    'employee_id' => $employee->id,
                    'date' => $date,
                    'validated' => $validated
                ]);
                return response()->json([
                    'error' => 'No attendance record found',
                    'message' => 'This employee has not been marked present for ' . $date,
                ], 404);
            }

            if ($attendance->out_time) {
                Log::info('Mark out failed: Already marked out', [
                    'attendance_id' => $attendance->id,
                    'existing_out_time' => $attendance->out_time
                ]);
                return response()->json([
                    'error' => 'Already marked out',
                    'message' => 'This employee has already been marked out for ' . $date,
                    'existing_record' => $attendance
                ], 409);
            }

            // Update the attendance record with out_time
            $attendance->out_time = $validated['out_time'];

            // Calculate work hours if in_time exists
            if ($attendance->in_time) {
                try {
                    $inTime = Carbon::createFromFormat('H:i:s', $attendance->in_time);
                    $outTime = Carbon::createFromFormat('H:i:s', $validated['out_time']);
                    $workHours = $outTime->diffInMinutes($inTime, true) / 60; // true = always positive
                    $attendance->work_hours = round($workHours, 2);
                } catch (\Exception $e) {
                    // If time parsing fails, don't calculate work hours
                    // This prevents the 500 error
                }
            }

            // Update notes if provided
            if ($validated['notes']) {
                $attendance->notes = $validated['notes'];
            }

            try {
                $attendance->save();
            } catch (\Exception $e) {
                Log::error('Mark out save failed', [
                    'attendance_id' => $attendance->id,
                    'error' => $e->getMessage()
                ]);
                throw $e;
            }

            return response()->json([
                'message' => 'Marked out successfully',
                'attendance' => $attendance
            ], 200);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'error' => 'Validation failed',
                'message' => 'Invalid input data',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Internal server error',
                'message' => $e->getMessage(),
                'line' => $e->getLine(),
                'file' => $e->getFile()
            ], 500);
        }
    }

    public function fingerprintConfig(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->isSystemAdmin()) {
            return response()->json(['message' => 'Only admins can view fingerprint configuration.'], 403);
        }

        $config = $this->getFingerprintConfig();
        return response()->json([
            'config' => [
                'enabled' => (bool) ($config['enabled'] ?? false),
                'base_url' => (string) ($config['base_url'] ?? ''),
                'logs_endpoint' => (string) ($config['logs_endpoint'] ?? '/logs'),
                'api_key' => (string) ($config['api_key'] ?? ''),
                'device_id' => (string) ($config['device_id'] ?? ''),
                'request_timeout' => (int) ($config['request_timeout'] ?? 10),
            ],
        ]);
    }

    public function updateFingerprintConfig(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->isSystemAdmin()) {
            return response()->json(['message' => 'Only admins can update fingerprint configuration.'], 403);
        }

        $validated = $request->validate([
            'enabled' => 'required|boolean',
            'base_url' => 'nullable|string|max:255',
            'logs_endpoint' => 'nullable|string|max:255',
            'api_key' => 'nullable|string|max:255',
            'device_id' => 'nullable|string|max:100',
            'request_timeout' => 'nullable|integer|min:3|max:60',
        ]);

        $config = [
            'enabled' => (bool) $validated['enabled'],
            'base_url' => trim((string) ($validated['base_url'] ?? '')),
            'logs_endpoint' => trim((string) ($validated['logs_endpoint'] ?? '/logs')),
            'api_key' => trim((string) ($validated['api_key'] ?? '')),
            'device_id' => trim((string) ($validated['device_id'] ?? '')),
            'request_timeout' => (int) ($validated['request_timeout'] ?? 10),
        ];

        $this->saveFingerprintConfig($config);

        return response()->json([
            'message' => 'Fingerprint machine configuration saved.',
            'config' => $config,
        ]);
    }

    public function syncFingerprintLogs(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->isSystemAdmin()) {
            return response()->json(['message' => 'Only admins can run fingerprint sync.'], 403);
        }

        $validated = $request->validate([
            'date' => 'nullable|date',
        ]);

        $config = $this->getFingerprintConfig();
        if (!($config['enabled'] ?? false)) {
            return response()->json(['message' => 'Fingerprint sync is disabled. Enable it in configuration first.'], 422);
        }

        $baseUrl = trim((string) ($config['base_url'] ?? ''));
        if ($baseUrl === '') {
            return response()->json(['message' => 'Fingerprint machine base URL is required.'], 422);
        }

        $endpoint = trim((string) ($config['logs_endpoint'] ?? '/logs'));
        if ($endpoint === '') {
            $endpoint = '/logs';
        }
        if (!str_starts_with($endpoint, '/')) {
            $endpoint = '/' . $endpoint;
        }
        $timeout = max(3, (int) ($config['request_timeout'] ?? 10));
        $targetDate = $validated['date'] ?? Carbon::today()->toDateString();

        $headers = ['Accept' => 'application/json,text/plain,*/*'];
        $apiKey = trim((string) ($config['api_key'] ?? ''));
        if ($apiKey !== '') {
            $headers['X-API-Key'] = $apiKey;
        }

        try {
            $response = Http::timeout($timeout)
                ->withHeaders($headers)
                ->get(rtrim($baseUrl, '/') . $endpoint, [
                    'date' => $targetDate,
                    'device_id' => (string) ($config['device_id'] ?? ''),
                ]);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Could not connect to fingerprint machine on local network.',
                'error' => $e->getMessage(),
            ], 422);
        }

        if (!$response->successful()) {
            return response()->json([
                'message' => 'Fingerprint machine responded with an error.',
                'status_code' => $response->status(),
                'body' => $response->body(),
            ], 422);
        }

        $rows = $this->parseFingerprintPayload((string) $response->body());
        if (empty($rows)) {
            return response()->json([
                'message' => 'No logs returned by fingerprint machine.',
                'created_records' => 0,
                'updated_records' => 0,
                'skipped_records' => 0,
                'errors' => [],
            ]);
        }

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];

        foreach ($rows as $idx => $rawRow) {
            $normalized = $this->normalizeFingerprintRow($rawRow);
            $rowDate = $normalized['date'] ?? $targetDate;
            if (!$rowDate) {
                $skipped++;
                $errors[] = 'Row ' . ($idx + 1) . ': Missing date.';
                continue;
            }

            $employee = null;
            if (!empty($normalized['employee_id'])) {
                $employee = Employee::find((int) $normalized['employee_id']);
            }
            if (!$employee && !empty($normalized['employee_code'])) {
                $employee = Employee::where('employee_code', $normalized['employee_code'])->first();
            }

            if (!$employee) {
                $skipped++;
                $errors[] = 'Row ' . ($idx + 1) . ': Employee not found for code/id.';
                continue;
            }

            $attendance = Attendance::where('employee_id', $employee->id)
                ->where('date', $rowDate)
                ->first();

            $inTime = $normalized['in_time'];
            $outTime = $normalized['out_time'];
            $status = $normalized['status'] ?? 'present';

            if ($attendance) {
                if ($inTime && (!$attendance->in_time || $inTime < $attendance->in_time)) {
                    $attendance->in_time = $inTime;
                }
                if ($outTime && (!$attendance->out_time || $outTime > $attendance->out_time)) {
                    $attendance->out_time = $outTime;
                }
                if (!$attendance->status || $attendance->status === 'absent') {
                    $attendance->status = $status;
                }

                if ($attendance->in_time && $attendance->out_time) {
                    try {
                        $in = Carbon::createFromFormat('H:i:s', $attendance->in_time);
                        $out = Carbon::createFromFormat('H:i:s', $attendance->out_time);
                        $attendance->work_hours = round($out->diffInMinutes($in, true) / 60, 2);
                    } catch (\Throwable) {
                        // Keep existing work hours if parsing fails
                    }
                }

                $attendance->save();
                $updated++;
                continue;
            }

            $newRecord = Attendance::create([
                'tenant_id' => (int) ($employee->tenant_id ?? $employee->branch_id ?? 1),
                'branch_id' => (int) ($employee->branch_id ?? 1),
                'employee_id' => (int) $employee->id,
                'date' => $rowDate,
                'in_time' => $inTime,
                'out_time' => $outTime,
                'status' => $status,
                'notes' => 'Imported from fingerprint machine',
            ]);

            if ($newRecord->in_time && $newRecord->out_time) {
                try {
                    $in = Carbon::createFromFormat('H:i:s', $newRecord->in_time);
                    $out = Carbon::createFromFormat('H:i:s', $newRecord->out_time);
                    $newRecord->work_hours = round($out->diffInMinutes($in, true) / 60, 2);
                    $newRecord->save();
                } catch (\Throwable) {
                    // Ignore time calculation issues
                }
            }

            $created++;
        }

        return response()->json([
            'message' => 'Fingerprint sync completed.',
            'created_records' => $created,
            'updated_records' => $updated,
            'skipped_records' => $skipped,
            'errors' => $errors,
        ]);
    }
}
