export { Button, buttonVariants, type ButtonProps } from './primitives/Button';
export { Badge, badgeVariants, type BadgeProps } from './primitives/Badge';
export {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
} from './primitives/Card';
export { Label } from './primitives/Label';
export { Input } from './primitives/Input';
export { Textarea } from './primitives/Textarea';
export { Select, type SelectOption, type SelectProps } from './primitives/Select';
export { Switch, type SwitchProps } from './primitives/Switch';
export { Checkbox, type CheckboxProps } from './primitives/Checkbox';
export {
	RadioGroup,
	RadioGroupItem,
	type RadioGroupProps,
	type RadioGroupItemProps,
} from './primitives/RadioGroup';
export {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
	type TabsProps,
	type TabsListProps,
	type TabsTriggerProps,
	type TabsContentProps,
	type TabsVariant,
} from './primitives/Tabs';
export {
	ResponsiveTabBar,
	type ResponsiveTabBarProps,
	type ResponsiveTabItem,
} from './primitives/ResponsiveTabBar';
export {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from './primitives/Table';
export {
	AlertTitle,
	AlertDescription,
	Alert,
	type AlertProps,
} from './primitives/Alert';
export { Progress, type ProgressProps } from './primitives/Progress';
export { Separator } from './primitives/Separator';
export { Skeleton } from './primitives/Skeleton';
export {
	useModalDialogController,
	Dialog,
	Sheet,
	Drawer,
	type DialogTone,
	type DialogProps,
	type SheetProps,
	type DrawerProps,
} from './primitives/Dialog';
export {
	TooltipProvider,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
	type TooltipProviderProps,
	type TooltipProps,
	type TooltipTriggerProps,
	type TooltipContentProps,
} from './primitives/Tooltip';
export {
	Popover,
	PopoverTrigger,
	PopoverContent,
	PopoverTitle,
	PopoverDescription,
	PopoverClose,
	type PopoverProps,
	type PopoverTriggerProps,
	type PopoverContentProps,
} from './primitives/Popover';
export {
	Menu,
	MenuTrigger,
	MenuContent,
	MenuItem,
	MenuSeparator,
	MenuGroup,
	MenuGroupLabel,
	DropdownMenu,
	type MenuProps,
	type MenuTriggerProps,
	type MenuContentProps,
	type MenuItemProps,
	type DropdownMenuItem,
	type DropdownMenuProps,
} from './primitives/DropdownMenu';
export {
	Combobox,
	type ComboboxOption,
	type ComboboxProps,
} from './primitives/Combobox';
export {
	Accordion,
	AccordionItem,
	AccordionTrigger,
	AccordionContent,
	type AccordionProps,
	type AccordionItemProps,
	type AccordionTriggerProps,
	type AccordionContentProps,
} from './primitives/Accordion';
export { ScrollArea, type ScrollAreaProps } from './primitives/ScrollArea';
export {
	toastManager,
	useToast,
	ToastProvider,
	ToastViewport,
	type ToastVariant,
	type ToastProviderProps,
} from './primitives/Toast';
export {
	CommandDialog,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	type CommandDialogProps,
	type CommandInputProps,
	type CommandItemProps,
} from './primitives/Command';
export {
	Stepper,
	type StepperStep,
	type StepperProps,
} from './primitives/Stepper';
export {
	Timeline,
	type TimelineItem,
	type TimelineProps,
} from './primitives/Timeline';

export { StatCard, type StatCardProps } from './patterns/StatCard';
export { CliBox, type CliBoxProps } from './patterns/CliBox';
export { CodePreview, type CodePreviewProps } from './patterns/CodePreview';
export { EmptyState, type EmptyStateProps } from './patterns/EmptyState';
export { ConfirmDialog, type ConfirmDialogProps } from './patterns/ConfirmDialog';
export {
	buildViewportActionItems,
	type ViewportActionDescriptor,
} from './patterns/ViewportActions';
export {
	isViewportCellObject,
	normalizeViewportBadges,
	normalizeViewportThumb,
	useRwDarkTheme,
	isFramedIconPayload,
	applyTextTruncate,
	resolveRecordVisuals,
	RecordLeadingVisual,
	BadgeGroup,
	CopyValueButton,
	type ViewportBadgeVariant,
	type ViewportBadgeSpec,
	type ViewportThumbSpec,
	type ViewportCellObject,
	type ResolvedRecordVisuals,
	type RecordLeadingVisualProps,
	type BadgeGroupProps,
	type CopyValueButtonProps,
} from './patterns/ViewportVisuals';

export {
	PortalRoot,
	getPortalContainer,
	PORTAL_ROOT_ID,
	type PortalRootProps,
} from '../portal/PortalRoot';

export {
	SortableHandle,
	SortableStatusRegion,
	useSortableList,
	moveArrayItem,
	projectTreeReorder,
	type SortableHandleProps,
	type TreeSortableNodeSpec,
	type ProjectedTreeReorder,
	type UseSortableListOptions,
} from './sortable';

export {
	ColumnSpanSlider,
	clampColSpan,
	colSpanToPercent,
	percentToColSpan,
	formatColSpanHint,
	type ColumnSpanSliderProps,
} from './column-span-slider';
