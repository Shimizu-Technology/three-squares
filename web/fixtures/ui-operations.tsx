import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '../src/index.css';
import AdminModal from '../src/components/admin/AdminModal';
import AdminPageHeader from '../src/components/admin/AdminPageHeader';
import AdminFilterBar from '../src/components/admin/AdminFilterBar';
import { Button } from '../src/components/ui/Button';
import { Field } from '../src/components/ui/Field';
import { Input } from '../src/components/ui/Input';
import { NavigationLink } from '../src/components/ui/NavigationLink';
import { StatusBadge } from '../src/components/ui/StatusBadge';
import { orderStatus } from '../src/components/ui/workflowStatus';

export function Fixture() {
  const [outer, setOuter] = useState(false), [inner, setInner] = useState(false), [pending, setPending] = useState(false);
  const opener = useRef<HTMLButtonElement>(null), nested = useRef<HTMLButtonElement>(null);
  const state = orderStatus({status:'confirmed',payment_status:'paid',fulfillment_type:'pickup'},'staff');
  return <main className="admin-main space-y-6 p-4 sm:p-6">
    <AdminPageHeader title="Operational acceptance" subtitle="Fictional workflows and nested dialog recovery." actions={<Button onClick={() => setOuter(true)} ref={opener}>Open order</Button>} />
    <AdminFilterBar><Field label="Order search"><Input type="search" /></Field></AdminFilterBar>
    <NavigationLink context="admin" brand to="/fixtures/ui-operations.html">Fictional admin brand</NavigationLink>
    <NavigationLink context="admin" to="/fixtures/ui-operations.html" aria-current="page">A long fictional operational navigation destination that wraps on narrow screens</NavigationLink>
    <NavigationLink href="#public-target">Public destination</NavigationLink>
    <div className="bg-tsNavy p-4"><NavigationLink surface="dark" href="#public-target">Public dark destination</NavigationLink></div>
    <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
    <AdminModal open={outer} onClose={() => setOuter(false)} title="Fictional order" returnFocusRef={opener} footer={<Button variant="secondary" onClick={() => setOuter(false)}>Close order</Button>}>
      <Button ref={nested} onClick={() => setInner(true)}>Open shipment</Button>
      {Array.from({length:80},(_,i)=><p key={i}>Fictional packing instruction {i+1}: keep the saved order context.</p>)}
    </AdminModal>
    <AdminModal open={inner} onClose={() => setInner(false)} title="Fictional shipment" dismissible={!pending} returnFocusRef={nested} footer={<Button variant="secondary" disabled={pending} onClick={() => setInner(false)}>Cancel shipment</Button>}>
      <Field label="Tracking number"><Input /></Field>
      <Button variant="secondary" onClick={() => setPending(value => !value)}>{pending ? 'Finish pending operation' : 'Start pending operation'}</Button>
    </AdminModal>
  </main>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Fixture /></BrowserRouter>);
