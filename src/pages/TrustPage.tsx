import { Shield, Lock, Server, Mail, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function TrustPage() {
  const navigate = useNavigate();
  const [showEmail, setShowEmail] = useState(false);

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <button
          onClick={() => navigate("/")}
          className="text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          ← Back to sign in
        </button>

        <div className="bg-card border border-border/60 rounded-2xl shadow-sm p-8 sm:p-10 space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Trust & Privacy</h1>
            <p className="text-sm text-muted-foreground">
              This page is maintained by MR Engineers to answer common security and privacy questions about our application.
            </p>
          </div>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Lock className="h-4 w-4 text-primary" />
              <h2>Access & Authentication</h2>
            </div>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1.5">
              <li>Sign-in is restricted to company-authorized email domains.</li>
              <li>Users authenticate with email and password. Password reset links expire automatically.</li>
              <li>Administrators control which users can access each module (e.g., Costing, Purchase, Manufacturing).</li>
              <li>Administrators can also assign per-document access, including view-only or edit permissions.</li>
              <li>Admin users retain full access for oversight and support.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Server className="h-4 w-4 text-primary" />
              <h2>Platform & Hosting</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              This application is built and hosted on the Lovable platform. Backend data is managed through a managed cloud database service. The app owner is responsible for access rules, user onboarding, and data practices described here. Platform-level infrastructure maintenance is handled by the platform provider.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Eye className="h-4 w-4 text-primary" />
              <h2>Data Collection & Use</h2>
            </div>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1.5">
              <li>We collect email addresses, names, and login timestamps for authentication and audit purposes.</li>
              <li>Business data you enter (orders, BOQs, invoices, purchase records) is stored to provide application functionality.</li>
              <li>We do not sell or share business data with third parties for advertising.</li>
              <li>Login attempts are logged to help detect unauthorized access.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Shield className="h-4 w-4 text-primary" />
              <h2>Retention & Deletion</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Business records are retained for as long as they are needed for operations and compliance. If you need specific data deleted, contact your administrator. Account-related data may be retained as required for security and legal obligations.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Mail className="h-4 w-4 text-primary" />
              <h2>Security Contact</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              If you discover a security issue or have a privacy concern, please contact the administrator.
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Admin email:</span>
              <button
                onClick={() => setShowEmail((s) => !s)}
                className="inline-flex items-center gap-1 text-primary font-medium hover:underline"
              >
                {showEmail ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    <span>admin@mrengineers.com</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    <span>Reveal</span>
                  </>
                )}
              </button>
            </div>
          </section>

          <div className="pt-4 border-t border-border/60 text-xs text-muted-foreground">
            This page is editable project content and is not an independent certification or audit report. If you need official compliance documentation, please contact your administrator directly.
          </div>
        </div>
      </div>
    </div>
  );
}
