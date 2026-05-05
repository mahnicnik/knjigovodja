-- ============================================================
-- KNJIGOVODJA.SI — Celotna baza podatkov v1.0
-- ============================================================
-- NAVODILO: supabase.com → SQL Editor → New Query → Run
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ORGANIZACIJE
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  tax_number TEXT NOT NULL UNIQUE,
  vat_number TEXT,
  vat_registered BOOLEAN DEFAULT false,
  iban TEXT,
  bic TEXT,
  address TEXT,
  post_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'SI',
  phone TEXT,
  email TEXT,
  contribution_class INTEGER DEFAULT 1,
  founded_date DATE,
  plan TEXT DEFAULT 'solo' CHECK (plan IN ('solo','employer','accountant')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CLANI ORGANIZACIJE
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','accountant','viewer')),
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- 3. PROFILI
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  onboarding_done BOOLEAN DEFAULT false,
  preferred_lang TEXT DEFAULT 'sl',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PREJETI RACUNI
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor TEXT,
  vendor_tax_num TEXT,
  receipt_date DATE,
  receipt_number TEXT,
  amount_net NUMERIC(10,2),
  vat_rate NUMERIC(5,2) DEFAULT 22,
  vat_amount NUMERIC(10,2),
  amount_total NUMERIC(10,2),
  category TEXT,
  description TEXT,
  is_deductible BOOLEAN DEFAULT true,
  image_url TEXT,
  ai_raw_json JSONB,
  ai_confidence NUMERIC(3,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  kpo_entry_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. KPO KNJIGA
CREATE TABLE kpo_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income','expense','contribution')),
  income NUMERIC(10,2) DEFAULT 0,
  expense NUMERIC(10,2) DEFAULT 0,
  vat_in NUMERIC(10,2) DEFAULT 0,
  vat_out NUMERIC(10,2) DEFAULT 0,
  receipt_id UUID REFERENCES receipts(id),
  invoice_id UUID,
  category TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. IZDANI RACUNI
CREATE TABLE issued_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_type TEXT DEFAULT 'invoice' CHECK (invoice_type IN ('invoice','proforma','advance','credit_note')),
  invoice_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_tax_number TEXT,
  client_vat_number TEXT,
  client_address TEXT,
  client_email TEXT,
  issue_date DATE NOT NULL,
  due_date DATE,
  service_date_from DATE,
  service_date_to DATE,
  line_items JSONB NOT NULL DEFAULT '[]',
  amount_net NUMERIC(10,2) NOT NULL,
  vat_amount NUMERIC(10,2) DEFAULT 0,
  amount_total NUMERIC(10,2) NOT NULL,
  zoi TEXT,
  eor TEXT,
  furs_confirmed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC(10,2),
  pdf_url TEXT,
  notes TEXT,
  reference TEXT,
  related_invoice_id UUID REFERENCES issued_invoices(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, invoice_number)
);

-- 7. DDV OBRACUNI
CREATE TABLE vat_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter IN (1,2,3,4)),
  vat_out NUMERIC(10,2) DEFAULT 0,
  vat_in NUMERIC(10,2) DEFAULT 0,
  vat_due NUMERIC(10,2) DEFAULT 0,
  sales_22 NUMERIC(10,2) DEFAULT 0,
  sales_95 NUMERIC(10,2) DEFAULT 0,
  sales_0 NUMERIC(10,2) DEFAULT 0,
  purchases_22 NUMERIC(10,2) DEFAULT 0,
  purchases_95 NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','calculated','submitted','paid')),
  xml_url TEXT,
  submitted_at TIMESTAMPTZ,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, year, quarter)
);

-- 8. DAVCNA PLACILA IN UPN
CREATE TABLE tax_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (payment_type IN (
    'zpiz_sp','zzzs_sp','income_tax_advance','vat',
    'salary_net','salary_income_tax',
    'salary_ee_contributions','salary_er_contributions',
    'regres','other'
  )),
  amount NUMERIC(10,2) NOT NULL,
  iban TEXT NOT NULL,
  reference TEXT,
  description TEXT,
  due_date DATE,
  qr_data TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled')),
  paid_at TIMESTAMPTZ,
  payslip_id UUID,
  vat_period_id UUID REFERENCES vat_periods(id),
  year INTEGER,
  month INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. ZAPOSLENI
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  tax_number TEXT NOT NULL,
  address TEXT,
  iban TEXT,
  employment_type TEXT DEFAULT 'full_time' CHECK (employment_type IN ('full_time','part_time','student')),
  start_date DATE NOT NULL,
  end_date DATE,
  gross_salary NUMERIC(10,2) NOT NULL,
  dependents INTEGER DEFAULT 0,
  vacation_days_per_year INTEGER DEFAULT 24,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','terminated')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. PLACILNE LISTE
CREATE TABLE payslips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  gross_salary NUMERIC(10,2) NOT NULL,
  ee_piz NUMERIC(10,2),
  ee_zzzs NUMERIC(10,2),
  ee_injury NUMERIC(10,2),
  ee_unemployment NUMERIC(10,2),
  ee_total NUMERIC(10,2),
  income_tax_base NUMERIC(10,2),
  income_tax NUMERIC(10,2),
  general_relief NUMERIC(10,2),
  dependent_relief NUMERIC(10,2),
  net_salary NUMERIC(10,2) NOT NULL,
  er_piz NUMERIC(10,2),
  er_zzzs NUMERIC(10,2),
  er_injury NUMERIC(10,2),
  er_unemployment NUMERIC(10,2),
  er_parental NUMERIC(10,2),
  er_total NUMERIC(10,2),
  total_cost NUMERIC(10,2),
  total_furs NUMERIC(10,2),
  rek1_xml_url TEXT,
  rek1_submitted BOOLEAN DEFAULT false,
  travel_expenses NUMERIC(10,2) DEFAULT 0,
  meal_allowance NUMERIC(10,2) DEFAULT 0,
  other_allowances NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','confirmed','rek1_ready','rek1_submitted','paid')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, year, month)
);

-- 11. DOPUST
CREATE TABLE leave_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('vacation','sick','sick_child','maternity','other')),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  days INTEGER NOT NULL,
  paid BOOLEAN DEFAULT true,
  approved BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. AI KLEPET
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  messages JSONB NOT NULL DEFAULT '[]',
  context_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_receipts_org ON receipts(org_id, receipt_date DESC);
CREATE INDEX idx_kpo_org ON kpo_entries(org_id, entry_date DESC);
CREATE INDEX idx_invoices_org ON issued_invoices(org_id, status);
CREATE INDEX idx_invoices_due ON issued_invoices(org_id, due_date);
CREATE INDEX idx_vat_org ON vat_periods(org_id, year, quarter);
CREATE INDEX idx_payments_org ON tax_payments(org_id, due_date);
CREATE INDEX idx_employees_org ON employees(org_id);
CREATE INDEX idx_payslips_org ON payslips(org_id, year, month DESC);
CREATE INDEX idx_members_user ON org_members(user_id);

-- RLS VARNOST
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpo_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE issued_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE POLICY "org_access" ON organizations FOR ALL USING (id IN (SELECT get_user_org_ids()));
CREATE POLICY "members_access" ON org_members FOR ALL USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY "own_profile" ON user_profiles FOR ALL USING (id = auth.uid());
CREATE POLICY "receipts_access" ON receipts FOR ALL USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY "kpo_access" ON kpo_entries FOR ALL USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY "invoices_access" ON issued_invoices FOR ALL USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY "vat_access" ON vat_periods FOR ALL USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY "payments_access" ON tax_payments FOR ALL USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY "employees_access" ON employees FOR ALL USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY "payslips_access" ON payslips FOR ALL USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY "leave_access" ON leave_records FOR ALL USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY "ai_access" ON ai_conversations FOR ALL USING (org_id IN (SELECT get_user_org_ids()));

-- AUTO PROFILE OB REGISTRACIJI
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- AUTO updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER upd_organizations BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER upd_receipts BEFORE UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER upd_kpo BEFORE UPDATE ON kpo_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER upd_invoices BEFORE UPDATE ON issued_invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER upd_vat BEFORE UPDATE ON vat_periods FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER upd_employees BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER upd_payslips BEFORE UPDATE ON payslips FOR EACH ROW EXECUTE FUNCTION update_updated_at();
