import React from 'react';
import { t } from '../lib/i18n';
import { Button } from '../ui';

export interface ViewportPaginationBarProps {
	page: number;
	totalPages: number;
	total: number;
	busy: boolean;
	onPageChange: (nextPage: number) => void;
}

export function ViewportPaginationBar({
	page,
	totalPages,
	total,
	busy,
	onPageChange,
}: ViewportPaginationBarProps): React.ReactElement | null {
	if (totalPages <= 1) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-muted-foreground">
			<div>
				{t('viewport.pageSummary', { page, totalPages }, 'Page {page} of {totalPages}')}{' '}
				({t('viewport.totalItems', { count: total }, '{count} items')})
			</div>
			<div className="flex items-center gap-1">
				<Button
					variant="outline"
					size="xs"
					disabled={busy || page <= 1}
					onClick={() => onPageChange(page - 1)}
				>
					{t('viewport.previousPage', 'Previous')}
				</Button>
				<Button
					variant="outline"
					size="xs"
					disabled={busy || page >= totalPages}
					onClick={() => onPageChange(page + 1)}
				>
					{t('viewport.nextPage', 'Next')}
				</Button>
			</div>
		</div>
	);
}
