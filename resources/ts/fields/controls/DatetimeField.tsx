import React, { useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { DynamicIcon } from '../../lib/utils';
import { Button, Input } from '../../ui';
import { dispatchDomChange } from '../shared';
import type { ReactInputfieldProps } from '../types';

export function DatetimeField(props: ReactInputfieldProps): React.ReactElement {
	const dt = props.datetime;
	const mode = dt?.mode || 'text';
	const htmlType = dt?.htmlType || 'date';

	const [textValue, setTextValue] = useState<string>(
		dt?.formattedValue ?? (typeof props.value === 'string' ? props.value : '')
	);
	const [datePart, setDatePart] = useState<string>(dt?.dateValue ?? '');
	const [timePart, setTimePart] = useState<string>(dt?.timeValue ?? '');
	const inputRef = useRef<HTMLInputElement | null>(null);

	const setTodayNow = () => {
		if (props.readOnly || props.disabled) {
			return;
		}
		const now = new Date();
		const yyyy = now.getFullYear();
		const mm = String(now.getMonth() + 1).padStart(2, '0');
		const dd = String(now.getDate()).padStart(2, '0');
		const hh = String(now.getHours()).padStart(2, '0');
		const min = String(now.getMinutes()).padStart(2, '0');
		const isoDate = `${yyyy}-${mm}-${dd}`;
		const isoTime = `${hh}:${min}`;
		const nextVal = dt?.hasTime ? `${isoDate} ${isoTime}` : isoDate;
		setDatePart(isoDate);
		setTimePart(isoTime);
		setTextValue(nextVal);
		props.onValueChange?.(props.name, nextVal);
		window.requestAnimationFrame(() => dispatchDomChange(inputRef.current));
	};

	const clearDate = () => {
		if (props.readOnly || props.disabled) {
			return;
		}
		setDatePart('');
		setTimePart('');
		setTextValue('');
		props.onValueChange?.(props.name, '');
		window.requestAnimationFrame(() => dispatchDomChange(inputRef.current));
	};

	if (mode === 'html') {
		if (htmlType === 'datetime') {
			return (
				<div className="flex flex-wrap items-center gap-2" data-rw-control="datetime">
					<Input
						ref={inputRef}
						id={props.id}
						name={props.name}
						type="date"
						value={datePart}
						onChange={(e) => {
							const nextDate = e.target.value;
							setDatePart(nextDate);
							const combined = nextDate ? (timePart ? `${nextDate} ${timePart}` : nextDate) : '';
							props.onValueChange?.(props.name, combined);
						}}
						min={dt?.dateMin || undefined}
						max={dt?.dateMax || undefined}
						step={dt?.dateStep && dt.dateStep > 1 ? dt.dateStep : undefined}
						readOnly={props.readOnly}
						disabled={props.disabled}
						required={props.required}
						className="w-auto min-w-[160px]"
					/>
					<Input
						id={`${props.id}__time`}
						name={`${props.name}__time`}
						type="time"
						value={timePart}
						onChange={(e) => {
							const nextTime = e.target.value;
							setTimePart(nextTime);
							const combined = datePart ? (nextTime ? `${datePart} ${nextTime}` : datePart) : nextTime;
							props.onValueChange?.(props.name, combined);
						}}
						min={dt?.timeMin || undefined}
						max={dt?.timeMax || undefined}
						step={dt?.timeStep && dt.timeStep > 0 ? dt.timeStep : undefined}
						readOnly={props.readOnly}
						disabled={props.disabled}
						required={props.required}
						className="w-auto min-w-[130px]"
					/>
					{!props.readOnly && !props.disabled ? (
						<Button type="button" variant="outline" size="xs" onClick={setTodayNow}>
							Now
						</Button>
					) : null}
				</div>
			);
		}

		const isTimeOnly = htmlType === 'time';
		return (
			<div className="flex flex-wrap items-center gap-2" data-rw-control="datetime">
				<Input
					ref={inputRef}
					id={props.id}
					name={props.name}
					type={isTimeOnly ? 'time' : 'date'}
					value={isTimeOnly ? timePart : datePart}
					onChange={(e) => {
						const nextVal = e.target.value;
						if (isTimeOnly) {
							setTimePart(nextVal);
						} else {
							setDatePart(nextVal);
						}
						props.onValueChange?.(props.name, nextVal);
					}}
					min={(isTimeOnly ? dt?.timeMin : dt?.dateMin) || undefined}
					max={(isTimeOnly ? dt?.timeMax : dt?.dateMax) || undefined}
					readOnly={props.readOnly}
					disabled={props.disabled}
					required={props.required}
					className="max-w-xs"
				/>
				{!props.readOnly && !props.disabled ? (
					<Button type="button" variant="outline" size="xs" onClick={setTodayNow}>
						{isTimeOnly ? 'Now' : 'Today'}
					</Button>
				) : null}
			</div>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-1.5" data-rw-control="datetime">
			<div className="relative flex-1 min-w-[200px]">
				<Input
					ref={inputRef}
					id={props.id}
					name={props.name}
					type="text"
					value={textValue}
					onChange={(e) => {
						setTextValue(e.target.value);
						props.onValueChange?.(props.name, e.target.value);
					}}
					placeholder={
						props.placeholder ||
						(dt?.hasTime ? 'YYYY-MM-DD HH:MM' : 'YYYY-MM-DD')
					}
					readOnly={props.readOnly}
					disabled={props.disabled}
					required={props.required}
					className="font-mono text-xs"
					{...(props.dataAttributes ?? {})}
				/>
			</div>
			{!props.readOnly && !props.disabled ? (
				<div className="inline-flex items-center gap-1">
					<Button type="button" variant="outline" size="sm" onClick={setTodayNow} className="h-9 px-2.5 text-xs">
						<DynamicIcon name="calendar" className="size-3.5" />
						<span>{dt?.hasTime ? t('form.now', 'Now') : t('form.today', 'Today')}</span>
					</Button>
					{textValue ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={clearDate}
							aria-label={t('form.clearDate', 'Clear date')}
							title={t('form.clearDate', 'Clear date')}
							className="h-9 px-2"
						>
							<DynamicIcon name="x" className="size-3.5" />
						</Button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
