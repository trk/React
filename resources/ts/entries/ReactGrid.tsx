import { getReactWorkspaceRuntime } from '../runtime';
import * as GridEngine from '../engines/grid';

const runtime = getReactWorkspaceRuntime();
runtime.__provideGrid(GridEngine);
