"use client";

import Link from "next/link";
import { useState } from "react";
import { TablePagination } from "@/components/ui/table";
import { activityPreview } from "@/lib/activity-preview";

type ActivityItem = { id: string; title: string; message: string; createdAt: string };

const activityDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" });

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  const [pageSize, setPageSize] = useState(3);
  const [requestedPage, setPage] = useState(1);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(items.length / pageSize)));
  const visibleItems = items.slice((page - 1) * pageSize, page * pageSize);

  if (!items.length) return <p className="text-body text-muted">No recent activity.</p>;

  return <>
    {visibleItems.map(activity => <article key={activity.id} className="space-y-ah-4">
      <p className="break-words text-label text-ink">{activity.title}</p>
      <p className="line-clamp-2 break-words text-body text-ink">{activityPreview(activity.message)}</p>
      <Link className="block text-caption text-sidebar underline" href="/notifications">View full message in Notifications</Link>
      <time dateTime={activity.createdAt} className="text-caption text-muted">{activityDate.format(new Date(activity.createdAt))}</time>
    </article>)}
    <TablePagination page={page} pageSize={pageSize} pageSizes={[3, 5]} rowsShown={visibleItems.length} totalRows={items.length}
      itemLabel={{ singular: "activity item", plural: "activity items" }}
      onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
  </>;
}
