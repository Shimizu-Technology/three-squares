import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { ActionMenu } from '../src/components/ui/ActionMenu';
import { Button } from '../src/components/ui/Button';
import { CheckField } from '../src/components/ui/CheckField';
import { Disclosure } from '../src/components/ui/Disclosure';
import { FileButton } from '../src/components/ui/FileButton';
import { Pagination } from '../src/components/ui/Pagination';
import { Switch } from '../src/components/ui/Switch';

export function Fixture() {
  const [enabled, setEnabled] = useState(false), [page, setPage] = useState(50), [command, setCommand] = useState('None');
  return <main className="mx-auto max-w-3xl space-y-6 p-4">
    <h1 className="text-2xl font-bold">Admin control acceptance</h1>
    <div className="flex justify-end"><ActionMenu label="More actions for fictional lunch">
      <Button variant="ghost" onClick={() => setCommand('Duplicate')}>Duplicate</Button>
      <Button variant="ghost" onClick={() => setCommand('Archive')}>Archive</Button>
    </ActionMenu></div>
    <p role="status">Command: {command}</p>
    <Switch aria-label="Ordering enabled" aria-checked={enabled} onClick={() => setEnabled(value => !value)} />
    <Switch aria-label="Unavailable setting" aria-checked={false} disabled />
    <CheckField name="featured">Featured fictional lunch</CheckField>
    <CheckField type="radio" name="tracking" value="product">Track one total quantity</CheckField>
    <FileButton accept=".csv" onChange={event => setCommand(event.target.files?.[0]?.name || 'None')}>Choose Menu CSV</FileButton>
    <FileButton disabled>Unavailable file upload</FileButton>
    <Disclosure title="Advanced shipping"><p>Shipping details remain inside the native disclosure.</p></Disclosure>
    <Pagination page={page} totalPages={10000} totalCount={250000} onPageChange={setPage} />
    <Button variant="secondary">Outside target</Button>
    <div className="fixed bottom-4 right-4"><ActionMenu label="More actions near screen edge"><Button variant="ghost" onClick={() => setCommand('Bottom command')}>Bottom command</Button></ActionMenu></div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
