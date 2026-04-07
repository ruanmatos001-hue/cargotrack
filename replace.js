const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace imports
content = content.replace("import { supabase } from './lib/supabase';", "import { supabase } from './lib/supabase';\nimport LandingPage from './LandingPage';");

// Replace Login signature
content = content.replace(/const Login = \(\{ onLogin \}: \{ onLogin: \(session: any\) => void \}\) => \{/, "const Login = ({ onLogin, onBack }: { onLogin: (session: any) => void, onBack?: () => void }) => {");

// Add Back Button in Login
const targetLoginCard = `className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center mb-10">`;

const replacementLoginCard = `className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10"
      >
        {onBack && (
          <button onClick={onBack} type="button" className="absolute top-6 left-6 text-slate-400 hover:text-white flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest transition-colors z-20">
            &larr; Voltar
          </button>
        )}
        <div className="flex flex-col items-center mb-10 mt-2">`;
content = content.replace(targetLoginCard, replacementLoginCard);

// Replace App starts
const targetAppStart = `export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);`;
const replacementAppStart = `export default function App() {
  const [session, setSession] = useState<any>(null);
  const [authView, setAuthView] = useState<'landing' | 'login'>('landing');
  const [profile, setProfile] = useState<Profile | null>(null);`;
content = content.replace(targetAppStart, replacementAppStart);

// Replace no session handling
const targetAuthCheck = `if (!session) {
    return <Login onLogin={setSession} />;
  }`;
const replacementAuthCheck = `if (!session) {
    if (authView === 'landing') {
      return <LandingPage onLoginClick={() => setAuthView('login')} />;
    }
    return <Login onLogin={setSession} onBack={() => setAuthView('landing')} />;
  }`;
content = content.replace(targetAuthCheck, replacementAuthCheck);

fs.writeFileSync('src/App.tsx', content);
console.log('Replaced successfully');
