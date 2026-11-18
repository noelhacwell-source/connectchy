"use client";
import {useEffect,useState} from "react";
import type {LayoutSettings} from "@/lib/layout-settings";
import WorkspaceDialog from "./WorkspaceDialog";

const defaults = {color:"#34475e", size:14, radius:10, x:0, y:0};
const selector = "button,[role=button],input[type=submit],input[type=button]";
function identity(el:HTMLElement) {
  const label = el.getAttribute("aria-label") || el.title || el.textContent?.trim() || el.getAttribute("value") || el.querySelector("svg")?.getAttribute("class") || "Button";
  const region = el.closest("dialog,nav,header,aside,form,section,main");
  return ((region?.getAttribute("aria-label") || region?.classList[0] || "page")+" / "+label.replace(/\s+/g," ")).slice(0,180);
}
export default function ButtonDesigner({layout,update}:{layout:LayoutSettings;update:(patch:Partial<LayoutSettings>)=>void}) {
  const [selected,select]=useState("");
  const {buttons,buttonEditing}=layout;
  useEffect(()=>{
    if(!buttonEditing && !Object.keys(buttons).length) return;
    function mark(el:HTMLElement) {
      if(!el.closest(".button-designer")) el.dataset.buttonDesign=identity(el);
    }
    function scan(root:Element) {
      if(root instanceof HTMLElement && root.matches(selector)) mark(root);
      root.querySelectorAll<HTMLElement>(selector).forEach(mark);
    }
    scan(document.body);
    const observer=new MutationObserver(records=>{
      for(const r of records){
        const parent=r.target instanceof Element?r.target:r.target.parentElement;
        const button=parent?.closest<HTMLElement>(selector);
        if(button) mark(button);
        r.addedNodes.forEach(n=>{if(n instanceof Element)scan(n)});
      }
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["aria-label","title"]});
    function pick(e:MouseEvent){
      const button=e.target instanceof Element?e.target.closest<HTMLElement>(selector):null;
      if(buttonEditing && e.altKey && button && !button.closest(".button-designer")){
        e.preventDefault(); e.stopImmediatePropagation(); select(identity(button));
      }
    }
    document.addEventListener("click",pick,true);
    return ()=>{observer.disconnect(); document.removeEventListener("click",pick,true)};
  },[buttonEditing,buttons]);
  const current=buttons[selected] || defaults;
  const set=(patch:Partial<typeof defaults>)=>update({buttons:{...buttons,[selected]:{...current,...patch}}});
  return <><style>{Object.entries(buttons).map(([key,s])=>`[data-button-design="${CSS.escape(key)}"]{background-color:${s.color}!important;font-size:${s.size}px!important;border-radius:${s.radius}px!important;translate:${s.x}px ${s.y}px!important}`).join("\n")}</style>
  {selected && <WorkspaceDialog label="Button appearance" close={()=>select("")}><div className="button-designer studio-form p-6"><h2>Button appearance</h2><p>{selected}</p>
  <label>Background <input type="color" value={current.color} onChange={e=>set({color:e.target.value})}/></label>
  {([["size","Text size",10,26],["radius","Corner radius",0,32],["x","Horizontal offset",-150,150],["y","Vertical offset",-150,150]] as const).map(([key,label,min,max])=><label key={key}>{label} · {current[key]} px<input type="range" min={min} max={max} value={current[key]} onChange={e=>set({[key]:Number(e.target.value)})}/></label>)}
  <button type="button" onClick={()=>{const next={...buttons};delete next[selected];update({buttons:next});select("")}}>Restore default</button></div></WorkspaceDialog>}</>;
}
