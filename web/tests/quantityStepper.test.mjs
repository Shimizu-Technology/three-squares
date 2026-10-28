import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const icon=url('export const IconButton = "button";');
const source=ts.transpileModule(readFileSync(new URL('../src/components/ui/QuantityStepper.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from ['"]([^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(name==='./IconButton'?icon:import.meta.resolve(name))}`);
const {QuantityStepper}=await import(url(source));
const render=props=>QuantityStepper({value:2,itemLabel:'Fictional meal',onChange(){},...props});

test('quantity stepper names the group and controls and emits absolute next values',()=>{
  const calls=[],tree=render({onChange:next=>calls.push(next)}),[minus,count,plus]=tree.props.children;
  assert.equal(tree.props.role,'group');assert.equal(tree.props['aria-label'],'Quantity of Fictional meal');
  assert.equal(minus.props['aria-label'],'Decrease quantity of Fictional meal');assert.equal(plus.props['aria-label'],'Increase quantity of Fictional meal');
  assert.equal(count.props.children,2);minus.props.onClick();plus.props.onClick();assert.deepEqual(calls,[1,3]);
});
test('default minimum, optional maximum and explicit zero minimum preserve caller bounds',()=>{
  assert.equal(render({value:1}).props.children[0].props.disabled,true);
  assert.equal(render({value:3,max:3}).props.children[2].props.disabled,true);
  const calls=[],zero=render({value:1,min:0,onChange:value=>calls.push(value)});zero.props.children[0].props.onClick();assert.deepEqual(calls,[0]);
});
test('disabled and pending states block handlers without changing numeric or target geometry',()=>{
  const idle=render();for(const state of [{pending:true},{disabled:true}]){
    const tree=render({...state,onChange:()=>assert.fail('blocked quantity changed')});
    for(const i of [0,2]){assert.equal(tree.props.children[i].props.disabled,true);tree.props.children[i].props.onClick();assert.equal(tree.props.children[i].props.size,'md');}
    assert.equal(tree.props.children[1].props.className,idle.props.children[1].props.className);
    assert.equal(tree.props.children[1].props.children,2);
  }
  assert.equal(render({pending:true}).props['aria-busy'],true);
});
test('only md and lg sizes are forwarded and the number keeps fixed width at digit boundaries',()=>{
  assert.equal(render({size:'lg'}).props.children[0].props.size,'lg');
  assert.equal(render({value:9}).props.children[1].props.className,render({value:10}).props.children[1].props.className);
  assert.match(render().props.children[1].props.className,/w-\[6ch\]/);
});
