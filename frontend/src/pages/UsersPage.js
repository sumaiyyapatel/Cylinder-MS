import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil } from "lucide-react";

const ROLES = ["ADMIN", "MANAGER", "OPERATOR", "ACCOUNTANT", "VIEWER"];

function validatePassword(password) {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must include a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a special character";
  return null;
}

export default function UsersPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: "", fullName: "", password: "", role: "VIEWER" });

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then(r => r.data),
    enabled: hasRole("ADMIN"),
  });

  const saveMut = useMutation({
    mutationFn: (d) => editing ? api.put(`/users/${editing.id}`, d) : api.post("/users", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setDialogOpen(false); toast.success(editing ? "User updated" : "User created"); },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

  if (!hasRole("ADMIN")) {
    return (
      <div className="py-12 text-center text-slate-500" data-testid="users-page">
        <p>Admin access required</p>
      </div>
    );
  }

  const openNew = () => { setEditing(null); setForm({ username: "", fullName: "", password: "", role: "VIEWER" }); setDialogOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ username: u.username, fullName: u.fullName, password: "", role: u.role }); setDialogOpen(true); };

  const handleSave = (e) => {
    e.preventDefault();

    if (!editing || form.password) {
      const pwdError = validatePassword(form.password);
      if (pwdError) return toast.error(pwdError);
    }

    const payload = { fullName: form.fullName, role: form.role };
    if (!editing) {
      payload.username = form.username;
      payload.password = form.password;
    } else if (form.password) {
      payload.password = form.password;
    }
    saveMut.mutate(payload);
  };

  return (
    <div className="space-y-4" data-testid="users-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>User Management</h1>
        <Button data-testid="add-user-btn" onClick={openNew} className="h-9 bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" /> Add User</Button>
      </div>

      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden max-w-3xl">
        <table className="w-full text-sm text-left" data-testid="users-table">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
              <th className="px-3 py-2">Username</th><th className="px-3 py-2">Full Name</th><th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th><th className="px-3 py-2">Last Login</th><th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr> :
              (users || []).map(u => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{u.username}</td>
                  <td className="px-3 py-2">{u.fullName}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{u.role}</Badge></td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${u.isActive ? "bg-green-50 text-green-700 ring-green-600/20" : "bg-red-50 text-red-700 ring-red-600/10"}`}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{u.lastLogin ? formatDate(u.lastLogin) : "Never"}</td>
                  <td className="px-3 py-2 text-right">
                    <button data-testid={`edit-user-${u.id}`} onClick={() => openEdit(u)} className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle style={{ fontFamily: 'var(--font-heading)' }}>{editing ? "Edit User" : "Add User"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {!editing && (
              <div><Label className="text-sm">Username *</Label><Input data-testid="user-username-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} maxLength={10} className="h-9 mt-1" required /></div>
            )}
            <div><Label className="text-sm">Full Name *</Label><Input data-testid="user-fullname-input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="h-9 mt-1" required /></div>
            <div><Label className="text-sm">{editing ? "New Password (leave blank to keep)" : "Password *"}</Label><Input data-testid="user-password-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" className="h-9 mt-1" required={!editing} /></div>
            <div><Label className="text-sm">Role *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="h-9 mt-1" data-testid="user-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-9">Cancel</Button>
              <Button type="submit" data-testid="user-save-btn" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>{saveMut.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
