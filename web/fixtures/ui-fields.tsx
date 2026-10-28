import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Field } from '../src/components/ui/Field';
import { Input } from '../src/components/ui/Input';
import { Select } from '../src/components/ui/Select';
import { Textarea } from '../src/components/ui/Textarea';
import { Button } from '../src/components/ui/Button';
import '../src/index.css';
export function Fixture() {
  const [error,setError]=useState<string>(),[saved,setSaved]=useState(''),[disabled,setDisabled]=useState(false);
  return <main className="admin-scope text-xl p-4 sm:p-6 space-y-6">
    <h1>Shared fields</h1>
    <form aria-label="Field example" className="space-y-4" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);if(!String(data.get('name')).trim()){setError('Enter a device name.');return;}setError(undefined);setSaved(`${data.get('name')} · ${data.get('location')} · ${data.get('notes')}`);}}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Device name" help="Choose a name used by staff." error={error}><Input leading="$" name="name" disabled={disabled}/></Field>
        <Field label="Order alert location"><Select leading="L" name="location" disabled={disabled}><option value="main">Main</option><option value="south">South</option></Select></Field>
      </div>
      <Field label="Notes" help="Fictional details only."><Textarea name="notes" disabled={disabled}/></Field>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={disabled}>Save fixture</Button><Button variant="secondary" onClick={()=>setDisabled(!disabled)}>Toggle disabled</Button></div>
      <output aria-live="polite">{saved}</output>
    </form>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
