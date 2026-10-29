// إنشاء حساب من سطر الأوامر — يُستخدم مرة واحدة لإنشاء حساب المالك الأول،
// وبعدها يُنشئ المالك باقي الحسابات من شاشة "الموظفون".
//
// الاستخدام:
//   npm run create-user -- --username owner --name "اسم المالك" --role super_admin
// سيطلب منك كلمة المرور بشكل مخفي (لا تُكتب في سجل الأوامر).
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline";

const { values } = parseArgs({
  options: {
    username: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "super_admin" },
    phone: { type: "string" },
  },
});

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.AUTH_EMAIL_DOMAIN || "staff.bridgefurniture.app";

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
if (!url || !key) fail("املأ NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في .env.local أولاً.");
const username = (values.username ?? "").trim().toLowerCase();
if (!/^[a-z0-9_.-]{3,32}$/.test(username)) fail("اسم المستخدم: حروف إنجليزية صغيرة وأرقام فقط (3 إلى 32).");
if (!values.name || values.name.trim().length < 2) fail('اكتب الاسم الكامل: --name "..."');
if (!["super_admin", "factory_admin", "sales"].includes(values.role)) fail("الدور: super_admin أو factory_admin أو sales.");

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = await askHidden("كلمة المرور (10 أحرف على الأقل، حروف وأرقام): ");
if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
  fail("كلمة المرور ضعيفة.");
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supabase.auth.admin.createUser({
  email: `${username}@${domain}`,
  password,
  email_confirm: true,
  app_metadata: { role: values.role },
});
if (error) fail(`فشل إنشاء الحساب: ${error.message}`);

const { error: pErr } = await supabase.from("profiles").insert({
  id: data.user.id,
  username,
  full_name: values.name.trim(),
  phone: values.phone ?? null,
  role: values.role,
});
if (pErr) {
  await supabase.auth.admin.deleteUser(data.user.id);
  fail(`فشل إنشاء الملف الشخصي: ${pErr.message}`);
}
console.log(`✓ تم إنشاء الحساب "${username}" بدور ${values.role}. ادخل به من صفحة /login`);
