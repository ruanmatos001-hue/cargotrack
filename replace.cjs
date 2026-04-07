const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace("import { supabase } from './lib/supabase';", "import { supabase } from './lib/supabase';\nimport LandingPage from './LandingPage';");

content = content.replace(/const Login = \(\{ onLogin \}: \{ onLogin: \(session: any\) => void \}\) => \{/, "const Login = ({ onLogin, onBack }: { onLogin: (session: any) => void, onBack?: () => void }) => {");

content = content.replace(/className=\"w-full max-w-md bg-white\/5 backdrop-blur-xl border border-white\/10 rounded-3xl p-8 shadow-2xl relative z-10\"\s*>\s*<div className=\"flex flex-col items-center mb-10\">/g, 'className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10">\n        {onBack && (\n          <button onClick={onBack} type="button" className="absolute top-6 left-6 text-slate-400 hover:text-white flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest transition-colors z-20">\n            &larr; Voltar\n          </button>\n        )}\n        <div className="flex flex-col items-center mb-10 mt-2">');

content = content.replace(/export default function App\(\) \{\s*const \[session, setSession\] = useState<any>\(null\);\s*const \[profile, setProfile\] = useState<Profile \| null>\(null\);/g, "export default function App() {\n  const [session, setSession] = useState<any>(null);\n  const [authView, setAuthView] = useState<'landing' | 'login'>('landing');\n  const [profile, setProfile] = useState<Profile | null>(null);");

content = content.replace(/if \(!session\) \{\s*return <Login onLogin=\{setSession\} \/>;\s*\}/g, "if (!session) {\n    if (authView === 'landing') {\n      return <LandingPage onLoginClick={() => setAuthView('login')} />;\n    }\n    return <Login onLogin={setSession} onBack={() => setAuthView('landing')} />;\n  }");

fs.writeFileSync('src/App.tsx', content);
console.log('Replaced successfully');
