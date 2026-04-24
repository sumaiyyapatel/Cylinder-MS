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
  const [utilityBusy, setUtilityBusy] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get("/settings").then(r => r.data),
  });

  const { data: gstRates } = useQuery({
    queryKey: ["gstRates"],
    queryFn: () => api.get("/settings/gst-rates").then(r => r.data),
  });

  useEffect(() => { if (data) setSettings(data); }, [data]);

  const validateSettings = (payload) => {
    const gstin = String(payload.company_gstin || "").trim().toUpperCase();
    const phone = String(payload.company_phone || "").replace(/\D/g, "");
    const thresholdRaw = String(payload.overdue_threshold_days || "").trim();

    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      return "Invalid GSTIN format";
    }
    if (phone && !/^\d{10}$/.test(phone)) {
      return "Phone must be 10 digits";
    }
    if (thresholdRaw) {
      const threshold = Number(thresholdRaw);
      if (!Number.isInteger(threshold) || threshold <= 0) {
        return "Overdue threshold must be a positive integer";
      }
    }
    return null;
  };

  const saveMut = useMutation({
    mutationFn: (d) => api.put("/settings", d),
    onSuccess: (res) => {
      const savedSettings = res.data;
      qc.invalidateQueries({ queryKey: ["settings"] });
      if (savedSettings) {
        setSettings(savedSettings);
        localStorage.setItem("companySettings", JSON.stringify(savedSettings));
      }
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

  const isAdmin = hasRole("ADMIN");

  const downloadJsonFile = (filename, payload) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const fetchExportResource = async (path, params) => {
    const response = await api.get(path, params ? { params } : undefined);
    return response.data;
  };

  const handleBackupDatabase = async () => {
    try {
      setUtilityBusy("backup");
      const [companySettings, gst, customers, areas, gasTypes] = await Promise.all([
        fetchExportResource("/settings"),
        fetchExportResource("/settings/gst-rates"),
        fetchExportResource("/customers", { limit: 5000 }),
        fetchExportResource("/areas", { limit: 5000 }),
        fetchExportResource("/gas-types"),
      ]);

      const backup = {
        generatedAt: new Date().toISOString(),
        type: "settings-and-masters",
        companySettings,
        gstRates: gst,
        customers: customers?.data || customers,
        areas: areas?.data || areas,
        gasTypes,
      };

      downloadJsonFile(`backup_${new Date().toISOString().slice(0, 10)}.json`, backup);
      toast.success("Backup exported");
    } catch (e) {
      toast.error(e.response?.data?.error || "Backup failed");
    } finally {
      setUtilityBusy(null);
    }
  };

  const handleRebuildIndex = async () => {
    try {
      setUtilityBusy("rebuild");
      await qc.invalidateQueries();
      await Promise.all([
        qc.refetchQueries({ queryKey: ["settings"] }),
        qc.refetchQueries({ queryKey: ["gstRates"] }),
      ]);
      toast.success("Local cache rebuilt");
    } catch {
      toast.error("Failed to rebuild local cache");
    } finally {
      setUtilityBusy(null);
    }
  };

  const handleExportAllData = async () => {
    try {
      setUtilityBusy("export");
      const [
        customers,
        areas,
        gasTypes,
        cylinders,
        transactions,
        challans,
        ecr,
        orders,
      ] = await Promise.all([
        fetchExportResource("/customers", { limit: 10000 }),
        fetchExportResource("/areas", { limit: 10000 }),
        fetchExportResource("/gas-types"),
        fetchExportResource("/cylinders", { limit: 10000 }),
        fetchExportResource("/transactions", { limit: 10000 }),
        fetchExportResource("/challans", { limit: 10000 }),
        fetchExportResource("/ecr", { limit: 10000 }),
        fetchExportResource("/orders", { limit: 10000 }),
      ]);

      const exportPayload = {
        generatedAt: new Date().toISOString(),
        type: "full-data-export",
        customers: customers?.data || customers,
        areas: areas?.data || areas,
        gasTypes,
        cylinders: cylinders?.data || cylinders,
        transactions: transactions?.data || transactions,
        challans: challans?.data || challans,
        ecr: ecr?.data || ecr,
        orders: orders?.data || orders,
      };

      downloadJsonFile(`all_data_${new Date().toISOString().slice(0, 10)}.json`, exportPayload);
      toast.success("All data exported");
    } catch (e) {
      toast.error(e.response?.data?.error || "Export failed");
    } finally {
      setUtilityBusy(null);
    }
  };

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
                    <div><Label htmlFor="settings-company-name" className="text-sm">Company Name</Label><Input id="settings-company-name" name="companyName" value={settings.company_name || ""} onChange={(e) => setSettings({ ...settings, company_name: e.target.value })} className="h-9 mt-1" disabled={!isAdmin} /></div>
                    <div><Label htmlFor="settings-gstin" className="text-sm">GSTIN</Label><Input id="settings-gstin" name="gstin" value={settings.company_gstin || ""} onChange={(e) => setSettings({ ...settings, company_gstin: e.target.value.toUpperCase() })} className="h-9 mt-1" disabled={!isAdmin} maxLength={15} /></div>
                    <div className="md:col-span-2"><Label htmlFor="settings-address" className="text-sm">Address</Label><Input id="settings-address" name="address" value={settings.company_address || ""} onChange={(e) => setSettings({ ...settings, company_address: e.target.value })} className="h-9 mt-1" disabled={!isAdmin} /></div>
                    <div><Label htmlFor="settings-city" className="text-sm">City</Label><Input id="settings-city" name="city" value={settings.company_city || ""} onChange={(e) => setSettings({ ...settings, company_city: e.target.value })} className="h-9 mt-1" disabled={!isAdmin} /></div>
                    <div><Label htmlFor="settings-phone" className="text-sm">Phone</Label><Input id="settings-phone" name="phone" value={settings.company_phone || ""} onChange={(e) => setSettings({ ...settings, company_phone: e.target.value.replace(/\D/g, "") })} className="h-9 mt-1" disabled={!isAdmin} maxLength={10} /></div>
                    <div><Label htmlFor="settings-financial-year" className="text-sm">Financial Year</Label><Input id="settings-financial-year" name="financialYear" value={settings.financial_year || ""} onChange={(e) => setSettings({ ...settings, financial_year: e.target.value })} className="h-9 mt-1" disabled={!isAdmin} /></div>
                    <div><Label htmlFor="settings-overdue-threshold" className="text-sm">Overdue Threshold (days)</Label><Input id="settings-overdue-threshold" name="overdueThreshold" value={settings.overdue_threshold_days || ""} onChange={(e) => setSettings({ ...settings, overdue_threshold_days: e.target.value.replace(/\D/g, "") })} type="number" className="h-9 mt-1" disabled={!isAdmin} /></div>
                  </div>
                  {isAdmin && (
                    <div className="pt-2"><Button data-testid="save-settings-btn" onClick={() => {
                      const error = validateSettings(settings);
                      if (error) return toast.error(error);
                      saveMut.mutate(settings);
                    }} className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}><Save className="w-4 h-4 mr-1" /> {saveMut.isPending ? "Saving..." : "Save Settings"}</Button></div>
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
              <Button
                variant="outline"
                className="h-9 w-full justify-start"
                onClick={handleBackupDatabase}
                disabled={utilityBusy === "backup"}
              >
                {utilityBusy === "backup" ? "Backing up..." : "Backup Database"}
              </Button>
              <Button
                variant="outline"
                className="h-9 w-full justify-start"
                onClick={handleRebuildIndex}
                disabled={utilityBusy === "rebuild"}
              >
                {utilityBusy === "rebuild" ? "Rebuilding..." : "Rebuild Index"}
              </Button>
              <Button
                variant="outline"
                className="h-9 w-full justify-start"
                onClick={handleExportAllData}
                disabled={utilityBusy === "export"}
              >
                {utilityBusy === "export" ? "Exporting..." : "Export All Data"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
