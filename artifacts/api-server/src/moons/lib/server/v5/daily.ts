import {q,json} from '../db.ts';
import {kstDay} from './kst.ts';
import {loadWorkspace,persistWorkspace,locked} from './workspace-store.ts';
import {refreshNotifications} from './notifications.ts';
export async function runDaily() {
 const day=kstDay();
 const lease=await q(`insert into daily_runs(day,state) values($1,'running') on conflict(day) do update set state='running',started_at=now()
 where daily_runs.state='failed' or (daily_runs.state='running' and daily_runs.started_at<now()-interval '30 minutes') returning day`,[day]);
 if(!lease.length)return {day,timeZone:'Asia/Seoul',skipped:true,reason:'already_run_or_running'};
 try{
  const owners=await q<{owner_id:string}>(`select w.owner_id from personal_workspaces w join guests g on g.id=w.owner_id
   left join user_workspaces u on u.user_id=g.user_id
   where g.user_id is null or u.owner_id=w.owner_id`);
  let created=0;
  for(const {owner_id} of owners)await locked(owner_id,async()=>{
   const state=await loadWorkspace(owner_id),before=state.store.notifications?.length??0;
   state.store.notifications=await refreshNotifications(state.store,owner_id);
   const added=state.store.notifications.length-before;
   if(added){await persistWorkspace(owner_id,state.revision,state.store);created+=added}
  });
  const result={day,timeZone:'Asia/Seoul',owners:owners.length,created,skipped:false};
  await q(`update daily_runs set state='complete',completed_at=now(),result=$2::jsonb where day=$1`,[day,json(result)]);
  return result;
 }catch(error){await q(`update daily_runs set state='failed' where day=$1`,[day]);throw error}
}
