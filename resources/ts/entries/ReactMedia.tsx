/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { getReactWorkspaceRuntime } from '../runtime';
import * as MediaModule from '../fields/media';
import { installReactMediaRuntime } from '../fields/mediaRuntime';

installReactMediaRuntime(MediaModule);

const runtime = getReactWorkspaceRuntime();
runtime.__provideMedia(MediaModule);
