import { editVisitTime } from '../services/itinerary-edit.mjs';
import { t } from '../../../utils/i18n.js';

export function openVisitTimeEditor(view, host, index) {
  if(!view.canEdit() || host.querySelector('.visit-time-editor')) return;
  const source=view.currentItinerary, day=view.activeDayIndex, request=view._mapRequest;
  const items=view.normalizeData(source)?.days?.[day]?.scheduleItems;
  const target=items?.[index];
  if(!target || ['departure','arrival','AnchorSchedule'].includes(target.type)) return;
  const form=document.createElement('form');form.className='visit-time-editor';
  const inputs=['visitStartLabel','visitEndLabel'].map((key,n)=>{
    const label=document.createElement('label');label.textContent=t(key);
    const input=document.createElement('input');input.type='time';input.required=true;
    input.value=n ? target.endTime || '' : target.time || '';label.append(input);form.append(label);return input;
  });
  const note=document.createElement('p');note.textContent=t('visitTimeNote');form.append(note);
  const error=document.createElement('p');error.setAttribute('role','alert');form.append(error);
  const submit=document.createElement('button');submit.type='submit';submit.textContent=t('visitTimeApply');
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent=t('cancelBtn');
  cancel.addEventListener('click',()=>form.remove());form.append(submit,cancel);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(!form.isConnected || !view.canEdit() || view.currentItinerary!==source || view.activeDayIndex!==day
      || view._mapRequest!==request || view.normalizeData(source)?.days?.[day]?.scheduleItems!==items) {
      error.textContent=t('visitTimeStale');return;
    }
    const result=editVisitTime(items,index,inputs[0].value,inputs[1].value);
    if(!result.changed){error.textContent=t('visitTimeInvalid');return;}
    view.state.replaceDayItems(day,result.items);form.remove();view.refreshAccessControls();view.requestMapRoute({scheduleEdited:true});
  });
  host.append(form);inputs[0].focus();
}
