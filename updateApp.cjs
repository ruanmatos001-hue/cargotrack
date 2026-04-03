const fs = require('fs');
const path = 'c:/Users/ruanm/Desktop/Doc/cargotrack/cargotrack/src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

const mIndex = content.indexOf(`{ id: 'pam', title: 'Pam AI'`);
if (mIndex !== -1) {
    const endLine = content.indexOf('\n', mIndex);
    const splice = '\n    { id: \'daily-schedule\', title: \'Programação Diária\', desc: \'Carregamento Kanban\', icon: Calendar, color: \'bg-blue-50 text-blue-600\', status: \'Active\' },';
    content = content.substring(0, endLine) + splice + content.substring(endLine);
}

const pamIndex = content.indexOf(`{view === 'pam' && (`);
if (pamIndex !== -1) {
    const endPam = content.indexOf(')}', pamIndex) + 2;
    const splice = '\n\n          {view === \'daily-schedule\' && (\n            <motion.div key=\"daily-schedule\" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className=\"h-full\">\n              <DailySchedulePanel onBack={() => setView(\'home\')} />\n            </motion.div>\n          )}';
    content = content.substring(0, endPam) + splice + content.substring(endPam);
}

fs.writeFileSync(path, content, 'utf8');
console.log('App.tsx updated');
