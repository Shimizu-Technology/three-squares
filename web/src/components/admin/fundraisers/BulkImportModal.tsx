import { useRef, useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import useLockBodyScroll from '../../../hooks/useLockBodyScroll';

interface BulkImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
}

interface BulkImportModalProps {
  onClose: () => void;
  onImport: (csvContent: string) => Promise<BulkImportResult>;
  title?: string;
  description?: string;
  templateHeaders?: string[];
  templateExample?: string[][];
}

export default function BulkImportModal({
  onClose,
  onImport,
  title = 'Bulk Import Participants',
  description = 'Upload a CSV file with participant information. The file should have columns: name, email, phone, participant_number, goal_amount.',
  templateHeaders = ['name', 'email', 'phone', 'participant_number', 'goal_amount'],
  templateExample = [
    ['John Smith', 'john@example.com', '671-555-0100', '001', '500'],
    ['Jane Doe', 'jane@example.com', '671-555-0101', '002', '500'],
  ],
}: BulkImportModalProps) {
  useLockBodyScroll(true);
  const modalContentRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [parseError, setParseError] = useState('');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError('');
    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
    };
    reader.onerror = () => {
      setParseError('Failed to read file');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setParseError('Please upload a CSV file');
      return;
    }

    setFileName(file.name);
    setParseError('');
    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvContent.trim()) {
      setParseError('Please select a CSV file');
      return;
    }

    setImporting(true);
    setParseError('');

    try {
      const importResult = await onImport(csvContent);
      setResult(importResult);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setParseError(error.response?.data?.error || error.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csvRows = [
      templateHeaders.join(','),
      ...templateExample.map(row => row.join(',')),
    ];
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'participants_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[85vh] flex flex-col min-h-0">
        <div className="px-6 py-4 border-b border-gray-200 shrink-0">
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>

        <div
          ref={modalContentRef}
          className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain"
          onWheel={(event) => {
            if (modalContentRef.current) {
              modalContentRef.current.scrollTop += event.deltaY;
            }
            event.stopPropagation();
            event.preventDefault();
          }}
        >
          <p className="text-sm text-gray-600">{description}</p>

          {/* Download Template */}
          <button
            type="button"
            onClick={downloadTemplate}
            className="text-sm text-tsPrimary hover:underline flex items-center gap-1"
          >
            <FileText className="w-4 h-4" />
            Download CSV template
          </button>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-tsPrimary transition"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            {fileName ? (
              <p className="text-sm font-medium text-gray-900">{fileName}</p>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Drag & drop your CSV file here, or click to browse
                </p>
                <p className="text-xs text-gray-400 mt-1">Supports .csv files</p>
              </>
            )}
          </div>

          {/* Parse Error */}
          {parseError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Import Result */}
          {result && (
            <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <div className="flex items-start gap-2">
                <CheckCircle className={`w-5 h-5 shrink-0 mt-0.5 ${result.success ? 'text-green-600' : 'text-yellow-600'}`} />
                <div className="flex-1">
                  <p className={`font-medium ${result.success ? 'text-green-700' : 'text-yellow-700'}`}>
                    Import Complete
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {result.imported} participants imported
                    {result.failed > 0 && `, ${result.failed} failed`}
                  </p>
                  {result.errors.length > 0 && (
                    <ul className="mt-2 text-sm text-red-600 list-disc list-inside">
                      {result.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {result.errors.length > 5 && (
                        <li>...and {result.errors.length - 5} more errors</li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || !csvContent}
              className="flex-1 px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
