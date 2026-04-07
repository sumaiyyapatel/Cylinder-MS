import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save } from "lucide-react";

export default function SettingsPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [settings, setSettings] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get("/settings").then(r => r.data),
  });

  const { data: gstRates } = useQuery({
    queryKey: ["gstRates"],
    queryFn: () => api.get("/settings/gst-rates").then(r => r.data),
  });

  useEffect(() => { if (data) setSettings(data); }, [data]);

  const saveMut = useMutation({
    mutationFn: (d) => api.put("/settings", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); toast.success("Settings saved"); },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

  const isAdmin = hasRole("ADMIN");

  return (
    <div className="space-y-4" data-testid="settings-page">
      <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Settings</h1>

      <Tabs defaultValue="company">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="gst">GST Rates</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card className="border border-slate-200 shadow-sm max-w-2xl">
            <CardHeader className="pb-3"><CardTitle className="text-lg" style={{ fontFamily: 'var(--font-heading)' }}>Company Settings</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? <div className="py-4 text-slate-400">Loading...</div> : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label className="text-sm">Company Name</Label><Input value={settings.company_name || ""} onChange={(e) => setSettings({ ...settings, company_name: e.target.value })} className="h-9 mt-1" disabled={!isAdmin} /></div>
                    <div><Label className="text-sm">GSTIN</Label><Input value={settings.company_gstin || ""} onChange={(e) => setSettings({ ...settings, company_gstin: e.target.value })} className="h-9 mt-1" disabled={!isAdmin} /></div>
                    <div className="md:col-span-2"><Label className="text-sm">Address</Label><Input value={settings.company_address || ""} onChange={(e) => setSettings({ ...settings, company_address: e.target.value })} className="h-9 mt-1" disabled={!isAdmin} /></div>
                    <div><Label className="text-sm">City</Label><Input value={settings.company_city || ""} onChange={(e) => setSettings({ ...settings, company_city: e.target.value })} className="h-9 mt-1" disabled={!isAdmin} /></div>
                    <div><Label className="text-sm">Phone</Label><Input value={settings.company_phone || ""} onChange={(e) => setSettings({ ...settings, company_phone: e.target.value })} className="h-9 mt-1" disabled={!isAdmin} /></div>
                    <div><Label className="text-sm">Financial Year</Label><Input value={settings.financial_year || ""} onChange={(e) => setSettings({ ...settings, financial_year: e.target.value })} className="h-9 mt-1" disabled={!isAdmin} /></div>
                    <div><Label className="text-sm">Overdue Threshold (days)</Label><Input value={settings.overdue_threshold_days || ""} onChange={(e) => setSettings({ ...settings, overdue_threshold_days: e.target.value })} type="number" className="h-9 mt-1" disabled={!isAdmin} /></div>
                  </div>
                  {isAdmin && (
                    <div className="pt-2"><Button data-testid="save-settings-btn" onClick={() => saveMut.mutate(settings)} className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}><Save className="w-4 h-4 mr-1" /> {saveMut.isPending ? "Saving..." : "Save Settings"}</Button></div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gst">
          <Card className="border border-slate-200 shadow-sm max-w-lg">
            <CardHeader className="pb-3"><CardTitle className="text-lg" style={{ fontFamily: 'var(--font-heading)' }}>GST Rates</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                    <th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2 text-right">Rate %</th><th className="px-3 py-2">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {(gstRates || []).map(r => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs">{r.gstCode}</td>
                      <td className="px-3 py-2">{r.gstName}</td>
                      <td className="px-3 py-2 text-right">{r.rate}%</td>
                      <td className="px-3 py-2">{r.isActive ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system">
          <Card className="border border-slate-200 shadow-sm max-w-lg">
            <CardHeader className="pb-3"><CardTitle className="text-lg" style={{ fontFamily: 'var(--font-heading)' }}>System Utilities</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="h-9 w-full justify-start">Backup Database</Button>
              <Button variant="outline" className="h-9 w-full justify-start">Rebuild Index</Button>
              <Button variant="outline" className="h-9 w-full justify-start">Export All Data</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
