import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Reader} from '@stripe/terminal-js';
import {Button} from '../src/components/ui/Button';
import {QuantityStepper} from '../src/components/ui/QuantityStepper';
import {POSProductTile} from '../src/components/pos/POSProductTile';
import {ReaderPickerDialog} from '../src/components/pos/ReaderPickerDialog';
import '../src/index.css';
import '../src/components/pos/pos.css';
export function Fixture(){
  const [value,setValue]=useState(9),[pending,setPending]=useState(false),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const opener=useRef<HTMLButtonElement>(null);
  return <main className="space-y-4 p-4"><h1 className="text-2xl">POS geometry fixture</h1>
    <div data-testid="tile-fixture" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))] gap-3">
      <POSProductTile name="Short meal" price="$12.95"/>
      <POSProductTile name="Grilled Salmon with Garlic Lemon Butter, Steamed Rice and Seasonal Vegetables" price="$19.95"/>
      <POSProductTile name="Long meal with a full two-line title and its in-cart state" price="$12.95" inCartQuantity={2}/>
      <POSProductTile name="Long sold-out meal with seasonal vegetables and steamed rice" price="$12.95" soldOut/>
    </div>
    <QuantityStepper value={value} onChange={setValue} min={1} max={20} pending={pending} itemLabel="Fixture meal"/>
    <QuantityStepper value={value} onChange={setValue} size="lg" itemLabel="Large fixture meal"/>
    <Button variant="secondary" onClick={()=>setPending(!pending)}>Toggle pending quantity</Button>
    <Button variant="secondary" onClick={()=>{setBusy(true);setOpen(true);setTimeout(()=>setBusy(false),750)}}>Choose busy fixture reader</Button>
    <Button variant="secondary" ref={opener} onClick={()=>setOpen(true)}>Choose fixture reader</Button>
    {open&&<ReaderPickerDialog readers={[{id:'reader-fixture',label:'Fixture reader',serial_number:'QA',device_type:'simulated'} as unknown as Reader]} connected={null} busy={busy} error={null} returnFocusRef={opener}
      onClose={()=>setOpen(false)} onConnect={()=>setOpen(false)} onDiscover={()=>{}} onDisconnect={()=>{}}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
