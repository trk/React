import { getReactWorkspaceRuntime } from '../runtime';
import * as DndEngine from '../engines/dnd';

const runtime = getReactWorkspaceRuntime();
runtime.__provideDnd(DndEngine);
