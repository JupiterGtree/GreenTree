import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/admin/request";
import { hasAdminPermission } from "@/lib/admin/permissions";
import AnalyticsDashboard from "./dashboard";
export const dynamic="force-dynamic";
export default async function AnalyticsPage(){ const session=await getCurrentAdminSession(); if(!session)redirect("/admin/login"); if(!hasAdminPermission(session.user.role,"analytics.view"))redirect("/admin"); return <AnalyticsDashboard />; }
