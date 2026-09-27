// Consulta semanal de visitas; los estados de asistencia quedan en la agenda.
const weekdayName=day=>({Lun:'Lunes',Mar:'Martes','Mié':'Miércoles',Jue:'Jueves',Vie:'Viernes','Sáb':'Sábado',Dom:'Domingo'}[day]);
function scheduledTime(p,date){
  const day=WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay()+6)%7];
  return p.scheduleTimes?.[day]??p.scheduleTime??'';
}
function studentScheduleFields(p,fresh){
  return `<div class="schedule-fields">${WEEKDAYS.map((day,i)=>{const active=!fresh&&p.weekdays.includes(day);return `<label class="field schedule-field" data-schedule-day="${day}" ${active?'':'hidden'}><span>${weekdayName(day)}</span><input type="time" id="student-time-${i}" data-weekday-time="${day}" aria-label="Horario del ${weekdayName(day).toLowerCase()}" value="${active?escapeHTML(p.scheduleTimes?.[day]??p.scheduleTime??''):''}" required ${active?'':'disabled'}></label>`}).join('')}</div><p class="fineprint">Indicá a qué hora viene cada día.</p>`;
}
function calendarWeekDates(){
  const date=new Date(`${TODAY}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
  return WEEKDAYS.map((_,i)=>{const day=new Date(date);day.setUTCDate(day.getUTCDate()+i);return day.toISOString().slice(0,10)});
}
function calendarVisits(date){
  const weekday=WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay()+6)%7];
  return DB.people.filter(p=>date===TODAY?p.attendanceDate===date:p.attendanceDate===date||p.weekdays.includes(weekday))
    .map(p=>({person:p,time:(p.attendanceDate===date?p.attendanceTime:'')||scheduledTime(p,date)}))
    .sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')||a.person.name.localeCompare(b.person.name,'es'));
}
function showCalendar(date=TODAY){
  const dates=calendarWeekDates();
  if(!dates.includes(date))date=TODAY;
  const visits=calendarVisits(date);
  const label=new Date(`${date}T12:00:00Z`).toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
  modal('Personas y horarios','Elegí un día para ver quiénes vienen.',`<div class="week-strip calendar-picker" aria-label="Días de la semana">${dates.map((day,i)=>`<button type="button" class="calendar-day ${day===date?'selected':''}" data-action="calendar:${day}" aria-pressed="${day===date}" aria-label="${WEEKDAYS[i]} ${Number(day.slice(-2))}"><span>${WEEKDAYS[i]}</span><strong>${Number(day.slice(-2))}</strong></button>`).join('')}</div><div class="calendar-list-heading"><h3>${label}</h3><span>${visits.length} ${visits.length===1?'persona':'personas'}</span></div>${visits.length?`<ul class="calendar-visits">${visits.map(({person:p,time})=>`<li>${time?`<time datetime="${date}T${time}">${escapeHTML(time)}</time>`:'<span class="calendar-no-time">Sin horario</span>'}${avatar(p)}<span class="calendar-person-name">${escapeHTML(p.name)}</span></li>`).join('')}</ul>`:'<p class="calendar-empty">No hay personas previstas para este día.</p>'}<p class="fineprint">Semana del 21 al 27 de septiembre · Horarios de demostración.</p>`);
  $('#modal').querySelector(`[data-action="calendar:${date}"]`).focus();
}
