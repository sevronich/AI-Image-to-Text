# ចិត្រា AI — របៀបបើក និងកែ source code

Project ចម្បងនៅ៖ `D:\Project\Chitra-AI`

## ប្រើជាធម្មតា

1. ចុចពីរដងលើ `START.cmd` ក្នុង folder នេះ។ វាបើក web app និង Qwen នៅ background ហើយបើក browser។
2. ចូល `http://127.0.0.1:5173/`។ រង់ចាំ model ផ្ទុកបន្តិច រួចចុច «ពិនិត្យការភ្ជាប់»។
3. ពេលឈប់ប្រើ ចុច `STOP.cmd` ដើម្បីបិទ app និង model ហើយដោះលែងអង្គចងចាំ GPU។ បិទ browser តែប៉ុណ្ណោះ មិនបិទ model ទេ។

ក្រោយ restart PC ត្រូវបើក `START.cmd` ម្ដង។ មិនចាំបាច់រត់ npm install ឬទាញយក model រាល់ពេលទេ។ Qwen មិនត្រូវការ API key។

## បើកក្នុង VS Code ឬ IDE

ក្នុង VS Code ជ្រើស **File → Open Folder → D:\Project\Chitra-AI**។ ឬបើក `Chitra-AI.code-workspace`។ IDE ផ្សេងៗក៏អាច Open Folder នេះបាន។

បើក terminal ក្នុង IDE ហើយប្រើ៖

```powershell
npm test
```

បន្ទាប់ពីកែកូដ ដើម្បីប្រើកំណែថ្មី៖

```powershell
.\STOP.cmd
npm run build
.\START.cmd
```

សម្រាប់កែ UI ដោយឃើញការផ្លាស់ប្ដូរភ្លាមៗ ប្រើ terminal ពីរ៖

```powershell
# បិទកំណែប្រើប្រាស់ធម្មតាមុន ដើម្បីដោះលែង port 5173
.\STOP.cmd
npm run qwen
```

```powershell
# Terminal ទីពីរ
npm run dev
```

ក្នុង VS Code ក៏អាចជ្រើស **Terminal → Run Task** ដើម្បី Start, Stop, Test ឬ Build។ Stop app មុន Build ដើម្បីកុំឲ្យ Windows ចាក់សោឯកសារ build។

## ទីតាំងឯកសារ

- `app/` និង `components/` — ផ្ទាំង web និង UI
- `lib/` — prompt, schema, ការភ្ជាប់ Qwen និង Google Translate
- `scripts/` — បើក/បិទ app និង local model
- `tests/` — automated tests
- `.local-qwen/` — model និង signed runtime ដែលបានដំឡើងរួច
- `README.md` — ព័ត៌មាន setup និង architecture លម្អិត

Source ដើមនៅ Drive C ត្រូវបានរក្សាទុកជាច្បាប់បម្រុង។ ទីតាំងនៅ Drive D នេះជាកន្លែងកែ និងដំណើរការចម្បង។
