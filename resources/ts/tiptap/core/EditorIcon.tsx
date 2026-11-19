/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { getReactWorkspaceRuntime } from '../../runtime';

const runtime = getReactWorkspaceRuntime();
const { React } = runtime;

export function EditorIcon({ name, className }: { name: string; className?: string }) {
	const svgProps = {
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 1.85,
		strokeLinecap: 'round' as const,
		strokeLinejoin: 'round' as const,
		className: className ? `size-3.5 shrink-0 ${className}` : 'size-3.5 shrink-0',
		'aria-hidden': true as const,
	};

	switch (name) {
		case 'bold':
			return (
				<svg {...svgProps}>
					<path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
					<path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
				</svg>
			);
		case 'italic':
			return (
				<svg {...svgProps}>
					<line x1="19" y1="4" x2="10" y2="4" />
					<line x1="14" y1="20" x2="5" y2="20" />
					<line x1="15" y1="4" x2="9" y2="20" />
				</svg>
			);
		case 'underline':
			return (
				<svg {...svgProps}>
					<path d="M6 4v6a6 6 0 0 0 12 0V4" />
					<line x1="4" y1="20" x2="20" y2="20" />
				</svg>
			);
		case 'strike':
			return (
				<svg {...svgProps}>
					<path d="M16 4H9a3 3 0 0 0-2.83 4" />
					<path d="M14 12a4 4 0 0 1 0 8H6" />
					<line x1="4" y1="12" x2="20" y2="12" />
				</svg>
			);
		case 'code':
			return (
				<svg {...svgProps}>
					<polyline points="16 18 22 12 16 6" />
					<polyline points="8 6 2 12 8 18" />
				</svg>
			);
		case 'highlight':
			return (
				<svg {...svgProps}>
					<path d="m9 11-6 6v3h9l3-3" />
					<path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
				</svg>
			);
		case 'subscript':
			return (
				<svg {...svgProps}>
					<path d="m4 5 8 8" />
					<path d="m12 5-8 8" />
					<path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.61-.44c-.42.24-.74.62-.9 1.07" />
				</svg>
			);
		case 'superscript':
			return (
				<svg {...svgProps}>
					<path d="m4 19 8-8" />
					<path d="m12 19-8-8" />
					<path d="M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06" />
				</svg>
			);
		case 'alignleft':
			return (
				<svg {...svgProps}>
					<line x1="21" y1="6" x2="3" y2="6" />
					<line x1="15" y1="12" x2="3" y2="12" />
					<line x1="17" y1="18" x2="3" y2="18" />
				</svg>
			);
		case 'aligncenter':
			return (
				<svg {...svgProps}>
					<line x1="21" y1="6" x2="3" y2="6" />
					<line x1="17" y1="12" x2="7" y2="12" />
					<line x1="19" y1="18" x2="5" y2="18" />
				</svg>
			);
		case 'alignright':
			return (
				<svg {...svgProps}>
					<line x1="21" y1="6" x2="3" y2="6" />
					<line x1="21" y1="12" x2="9" y2="12" />
					<line x1="21" y1="18" x2="7" y2="18" />
				</svg>
			);
		case 'alignjustify':
			return (
				<svg {...svgProps}>
					<line x1="3" y1="6" x2="21" y2="6" />
					<line x1="3" y1="12" x2="21" y2="12" />
					<line x1="3" y1="18" x2="21" y2="18" />
				</svg>
			);
		case 'bullist':
			return (
				<svg {...svgProps}>
					<line x1="8" y1="6" x2="21" y2="6" />
					<line x1="8" y1="12" x2="21" y2="12" />
					<line x1="8" y1="18" x2="21" y2="18" />
					<line x1="3" y1="6" x2="3.01" y2="6" />
					<line x1="3" y1="12" x2="3.01" y2="12" />
					<line x1="3" y1="18" x2="3.01" y2="18" />
				</svg>
			);
		case 'numlist':
			return (
				<svg {...svgProps}>
					<line x1="10" y1="6" x2="21" y2="6" />
					<line x1="10" y1="12" x2="21" y2="12" />
					<line x1="10" y1="18" x2="21" y2="18" />
					<path d="M4 6h1v4" />
					<path d="M4 10h2" />
					<path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
				</svg>
			);
		case 'tasklist':
			return (
				<svg {...svgProps}>
					<rect x="3" y="5" width="6" height="6" rx="1" />
					<path d="m3 17 2 2 4-4" />
					<path d="M13 6h8" />
					<path d="M13 12h8" />
					<path d="M13 18h8" />
				</svg>
			);
		case 'blockquote':
			return (
				<svg {...svgProps}>
					<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
					<path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
				</svg>
			);
		case 'codeblock':
			return (
				<svg {...svgProps}>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<path d="m10 9-3 3 3 3" />
					<path d="m14 15 3-3-3-3" />
				</svg>
			);
		case 'link':
			return (
				<svg {...svgProps}>
					<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
					<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
				</svg>
			);
		case 'unlink':
			return (
				<svg {...svgProps}>
					<path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
					<path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
					<line x1="2" y1="2" x2="22" y2="22" />
				</svg>
			);
		case 'anchor':
			return (
				<svg {...svgProps}>
					<circle cx="12" cy="5" r="3" />
					<line x1="12" y1="22" x2="12" y2="8" />
					<path d="M5 12H2a10 10 0 0 0 20 0h-3" />
				</svg>
			);
		case 'image':
			return (
				<svg {...svgProps}>
					<rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
					<circle cx="9" cy="9" r="2" />
					<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
				</svg>
			);
		case 'table':
			return (
				<svg {...svgProps}>
					<path d="M12 3v18" />
					<rect width="18" height="18" x="3" y="3" rx="2" />
					<path d="M3 9h18" />
					<path d="M3 15h18" />
				</svg>
			);
		case 'hr':
			return (
				<svg {...svgProps}>
					<line x1="3" y1="12" x2="21" y2="12" />
					<line x1="8" y1="6" x2="16" y2="6" strokeOpacity="0.45" />
					<line x1="8" y1="18" x2="16" y2="18" strokeOpacity="0.45" />
				</svg>
			);
		case 'removeformat':
			return (
				<svg {...svgProps}>
					<path d="M4 7V4h16v3" />
					<path d="M5 20h6" />
					<path d="M13 4 8 20" />
					<path d="m15 15 5 5" />
					<path d="m20 15-5 5" />
				</svg>
			);
		case 'source':
			return (
				<svg {...svgProps}>
					<path d="m18 16 4-4-4-4" />
					<path d="m6 8-4 4 4 4" />
					<path d="m14.5 4-5 16" />
				</svg>
			);
		case 'fullscreen':
			return (
				<svg {...svgProps}>
					<path d="M8 3H5a2 2 0 0 0-2 2v3" />
					<path d="M21 8V5a2 2 0 0 0-2-2h-3" />
					<path d="M3 16v3a2 2 0 0 0 2 2h3" />
					<path d="M16 21h3a2 2 0 0 0 2-2v-3" />
				</svg>
			);
		case 'undo':
			return (
				<svg {...svgProps}>
					<path d="M3 7v6h6" />
					<path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
				</svg>
			);
		case 'redo':
			return (
				<svg {...svgProps}>
					<path d="M21 7v6h-6" />
					<path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
				</svg>
			);
		default:
			return null;
	}
}
