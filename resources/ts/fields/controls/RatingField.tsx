import React, { useEffect, useState } from 'react';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge } from '../../ui';
import type { ReactInputfieldProps } from '../types';

export function RatingField(props: ReactInputfieldProps): React.ReactElement {
	const maxStars = Math.max(3, Math.min(10, Number(props.maxStars || props.max || 5)));
	const initialRating = Number(props.value) || 0;
	const [rating, setRating] = useState<number>(initialRating);
	const [hoverRating, setHoverRating] = useState<number>(0);

	useEffect(() => {
		setRating(Number(props.value) || 0);
	}, [props.value]);

	const selectStar = (star: number) => {
		if (props.readOnly || props.disabled) {
			return;
		}
		const next = rating === star ? 0 : star;
		setRating(next);
		props.onValueChange?.(props.name, next);
	};

	const activeDisplay = hoverRating || rating;

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
							type="button"
							role="radio"
							aria-checked={rating === star}
							disabled={props.disabled || props.readOnly}
							onMouseEnter={() => !props.readOnly && !props.disabled && setHoverRating(star)}
							onClick={() => selectStar(star)}
							aria-label={`Rate ${star} out of ${maxStars}`}
							className={cn(
								'rounded p-0.5 transition-transform hover:scale-110 cursor-pointer disabled:cursor-not-allowed',
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
