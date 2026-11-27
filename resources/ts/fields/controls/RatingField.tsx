import React, { useRef, useState } from 'react';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge } from '../../ui';
import type { ReactInputfieldProps } from '../types';

export function RatingField(props: ReactInputfieldProps): React.ReactElement {
	const maxStars = Math.max(3, Math.min(10, Number(props.maxStars || props.max || 5)));
	const incomingRating = Number(props.value) || 0;
	const [prevPropRating, setPrevPropRating] = useState<number>(incomingRating);
	const [rating, setRating] = useState<number>(incomingRating);
	const [hoverRating, setHoverRating] = useState<number>(0);
	const starBtnRefs = useRef<Array<HTMLButtonElement | null>>([]);

	if (incomingRating !== prevPropRating) {
		setPrevPropRating(incomingRating);
		if (rating !== incomingRating) {
			setRating(incomingRating);
		}
	}

	const isLocked = Boolean(props.readOnly || props.disabled);

	const selectStar = (star: number) => {
		if (isLocked) {
			return;
		}
		const next = rating === star ? 0 : star;
		setRating(next);
		props.onValueChange?.(props.name, next);
	};

	const moveToStar = (targetStar: number) => {
		if (isLocked) {
			return;
		}
		setRating(targetStar);
		props.onValueChange?.(props.name, targetStar);
		starBtnRefs.current[targetStar - 1]?.focus();
	};

	const activeDisplay = hoverRating || rating;
	const rovingStar = rating > 0 ? Math.min(maxStars, rating) : 1;

	return (
		<div className="flex items-center gap-2" data-rw-control="rating">
			<input type="hidden" id={props.id} name={props.name} value={rating > 0 ? String(rating) : ''} />
			<div
				className="inline-flex items-center gap-0.5 py-0.5"
				role="radiogroup"
				aria-label={props.label || props.name || 'Rating'}
				onMouseLeave={() => setHoverRating(0)}
			>
				{Array.from({ length: maxStars }, (_, i) => i + 1).map((star) => {
					const isFilled = star <= activeDisplay;
					return (
						<button
							key={star}
							ref={(el) => {
								starBtnRefs.current[star - 1] = el;
							}}
							type="button"
							role="radio"
							tabIndex={star === rovingStar ? 0 : -1}
							aria-checked={rating === star}
							disabled={isLocked}
							onMouseEnter={() => !isLocked && setHoverRating(star)}
							onClick={() => selectStar(star)}
							onKeyDown={(e) => {
								if (isLocked) {
									return;
								}
								if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
									e.preventDefault();
									moveToStar(star >= maxStars ? 1 : star + 1);
								} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
									e.preventDefault();
									moveToStar(star <= 1 ? maxStars : star - 1);
								} else if (e.key === 'Home') {
									e.preventDefault();
									moveToStar(1);
								} else if (e.key === 'End') {
									e.preventDefault();
									moveToStar(maxStars);
								}
							}}
							aria-label={`Rate ${star} out of ${maxStars}`}
							className={cn(
								'rounded p-0.5 transition-transform hover:scale-110 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
								isFilled ? 'text-warning' : 'text-muted-foreground/35 hover:text-warning/80'
							)}
						>
							<DynamicIcon name="star" className="size-5 fill-current" aria-hidden="true" />
						</button>
					);
				})}
			</div>
			{rating > 0 ? (
				<Badge variant="outline" mono>
					{rating} / {maxStars}
				</Badge>
			) : null}
		</div>
	);
}
