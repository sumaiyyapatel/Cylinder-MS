import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatINR, formatDate } from "@/lib/utils-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, RotateCcw, IndianRupee, Clock, AlertTriangle, CreditCard } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#2563EB", "#16A34A", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"];

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/dashboard").then((r) => r.data),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-md border border-slate-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const stats = data?.stats || {};
  const statCards = [
    { label: "Cylinders Out Today", value: stats.cylindersOutToday || 0, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Cylinders Returned", value: stats.cylindersReturnedToday || 0, icon: RotateCcw, color: "text-green-600", bg: "bg-green-50" },
    { label: "Cash Collected Today", value: formatINR(stats.cashCollectedToday), icon: IndianRupee, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Pending ECRs", value: stats.pendingEcrs || 0, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Overdue Cylinders", value: stats.overdueCylinders || 0, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
    { label: "Outstanding Payments", value: formatINR(stats.outstandingPayments), icon: CreditCard, color: "text-slate-600", bg: "bg-slate-100" },
  ];

  // Build chart data for daily issues vs returns
  const dateMap = {};
  (data?.dailyIssues || []).forEach((d) => {
    const key = formatDate(d.date);
    if (!dateMap[key]) dateMap[key] = { date: key, issues: 0, returns: 0 };
    dateMap[key].issues = d.count;
  });
  (data?.dailyReturns || []).forEach((d) => {
    const key = formatDate(d.date);
    if (!dateMap[key]) dateMap[key] = { date: key, issues: 0, returns: 0 };
    dateMap[key].returns = d.count;
  });
  const chartData = Object.values(dateMap).sort((a, b) => {
    const [ad, am, ay] = a.date.split("/");
    const [bd, bm, by] = b.date.split("/");
    return new Date(`${ay}-${am}-${ad}`) - new Date(`${by}-${bm}-${bd}`);
  });

  // Pie chart data
  const pieData = (data?.cylindersByGas || []).map((g) => ({
    name: g.gasCode,
    value: g.count,
  }));

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="dashboard-stats">
        {statCards.map((s) => (
          <Card key={s.label} className="border border-slate-200 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-md ${s.bg} flex items-center justify-center flex-shrink-0`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">{s.label}</div>
                <div className="text-xl font-bold text-slate-900 mt-0.5" style={{ fontFamily: 'var(--font-heading)' }}>{s.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart */}
        <Card className="lg:col-span-2 border border-slate-200 shadow-sm" data-testid="daily-chart">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
              Daily Issues vs Returns (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="issues" fill="#2563EB" name="Issues" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="returns" fill="#16A34A" name="Returns" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                No transaction data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card className="border border-slate-200 shadow-sm" data-testid="gas-pie-chart">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
              Cylinders by Gas Type
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                No cylinder data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Customers */}
      <Card className="border border-slate-200 shadow-sm" data-testid="top-customers-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
            Top 5 Customers by Cylinders Held
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Customer Name</th>
                  <th className="px-3 py-2 text-right">Cylinders Held</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topCustomers || []).length > 0 ? (
                  data.topCustomers.map((c, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs">{c.code}</td>
                      <td className="px-3 py-2">{c.name}</td>
                      <td className="px-3 py-2 text-right font-semibold">{c.cylindersHeld}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">No data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
