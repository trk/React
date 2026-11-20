import { getReactWorkspaceRuntime } from '../runtime';
import * as CalendarEngine from '../engines/calendar';

const runtime = getReactWorkspaceRuntime();
runtime.__provideCalendar(CalendarEngine);
