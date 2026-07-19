<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use App\Models\Candidate;
use App\Models\Company;
use App\Models\Customer;
use App\Models\MicrofinanceLoanRequestDocument;
use App\Support\StoredFile;
use App\Http\Controllers\Reports\LoanRepaymentReportController;

Route::get('/', function () {
    return view('welcome');
});

// Public media route for candidate photos, avoids symlink issues on some Windows setups
Route::get('/media/candidates/{candidate}/photo', function (Candidate $candidate) {
    if (!$candidate->photo_path) {
        abort(404);
    }
    if (!Storage::disk('public')->exists($candidate->photo_path)) {
        abort(404);
    }
    return response()->file(Storage::disk('public')->path($candidate->photo_path));
})->name('candidate.photo');

Route::get('/media/customers/{customer}/photo', function (Customer $customer) {
    if (!$customer->photo_path) {
        abort(404);
    }

    return StoredFile::response($customer->photo_path);
})->name('customer.photo');

Route::get('/media/companies/{company}/logo', function (Company $company) {
    if (!$company->logo_path) {
        abort(404);
    }

    return StoredFile::response($company->logo_path);
})->name('company.logo');

Route::get('/media/company/logo', function () {
    try {
        $companyWithLogo = Company::query()
            ->whereNotNull('logo_path')
            ->where('logo_path', '!=', '')
            ->orderByDesc('updated_at')
            ->first();

        if (!$companyWithLogo) {
            abort(404);
        }

        $response = StoredFile::response($companyWithLogo->logo_path);
        $response->headers->set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

        return $response;
    } catch (\Throwable $exception) {
        report($exception);
        abort(404);
    }
})->name('company.logo.current');

Route::get('/media/loan-documents/{document}', function (MicrofinanceLoanRequestDocument $document) {
    if (!$document->file_path) {
        abort(404);
    }

    return StoredFile::response($document->file_path);
})->name('loan-document.media');

Route::get('/reports/loan-repayment', [LoanRepaymentReportController::class, 'index'])
    ->name('reports.loan-repayment');
