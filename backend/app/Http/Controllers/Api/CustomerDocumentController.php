<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CustomerDocumentController extends Controller
{
    public function index(Customer $customer): JsonResponse
    {
        return response()->json(['data' => $customer->documents()->latest()->get()]);
    }

    public function store(Request $request, Customer $customer): JsonResponse
    {
        $request->validate([
            'document_type' => ['required', 'string', 'max:120'],
            'file' => ['required', 'file', 'max:5120'],
        ]);

        $file = $request->file('file');
        $path = $file->store('public/customers/' . $customer->id);
        $doc = $customer->documents()->create([
            'document_type' => $request->get('document_type'),
            'file_path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'uploaded_by' => $request->user()->id,
        ]);

        return response()->json($doc, 201);
    }

    public function destroy(Customer $customer, CustomerDocument $document): JsonResponse
    {
        if ($document->customer_id !== $customer->id) {
            return response()->json(['message' => 'Not found'], 404);
        }
        if ($document->file_path) {
            Storage::delete($document->file_path);
        }
        $document->delete();
        return response()->json(null, 204);
    }

    public function download(Customer $customer, CustomerDocument $document)
    {
        if ($document->customer_id !== $customer->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return Storage::download($document->file_path, $document->original_name ?: null);
    }
}
