import { API_URL, demoFamilyData, globalState } from './config.js';
import { showToast } from './ui.js';

export function fetchFamilyDatabase(onSuccess, onError, onNoApi) {
    if (!API_URL || API_URL.trim() === "") {
        onNoApi();
        return;
    }

    fetch(API_URL)
        .then(response => response.json())
        .then(data => {
            if (data.status === "new" || !data.nodes || data.nodes.length === 0) {
                globalState.familyData = JSON.parse(JSON.stringify(demoFamilyData));
                initializeNodePositions();
                saveToCloudSilent();
            } else {
                globalState.familyData = data;
                initializeNodePositions();
            }
            onSuccess();
        })
        .catch(error => {
            onError(error);
        });
}

export function initializeNodePositions() {
    globalState.familyData.nodes.forEach((n) => {
        // Strip out existing coordinates to enforce the strict deterministic blueprint
        delete n.x;
        delete n.y;
        delete n.fx;
        delete n.fy;
        delete n.px;
        delete n.py;
        delete n.vx;
        delete n.vy;

        if (n.isAlive === undefined) n.isAlive = n.death === "";
    });
}

export function saveToCloudSilent() {
    if (!API_URL) return;
    fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: getCleanDataString()
    });
}

export function saveToCloud() {
    if (!API_URL) return;

    const saveBtn = document.getElementById('btn-cloud-save');
    const originalHTML = saveBtn.innerHTML;

    saveBtn.innerHTML = `<svg class="animate-spin h-4 w-4 text-white inline-block pointer-events-none" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25 pointer-events-none" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75 pointer-events-none" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Saving...`;
    saveBtn.classList.add('pointer-events-none', 'opacity-80');

    fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: getCleanDataString()
    })
    .then(() => {
        setTimeout(() => {
            saveBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4 pointer-events-none"></i> Saved!`;
            saveBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
            saveBtn.classList.add('bg-emerald-500');
            lucide.createIcons();
            
            showToast("Changes synced successfully to Google Sheets!");
            
            setTimeout(() => {
                saveBtn.innerHTML = originalHTML;
                saveBtn.classList.remove('bg-emerald-500', 'pointer-events-none', 'opacity-80');
                saveBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
                lucide.createIcons();
            }, 2000);
        }, 500);
    })
    .catch(error => {
        console.error("Save failed:", error);
        saveBtn.innerHTML = `Error Saving`;
        saveBtn.classList.remove('bg-emerald-600');
        saveBtn.classList.add('bg-rose-600');
        showToast("Failed to save data to cloud.", "error");
        setTimeout(() => {
            saveBtn.innerHTML = originalHTML;
            saveBtn.classList.remove('bg-rose-600', 'pointer-events-none', 'opacity-80');
            saveBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
            lucide.createIcons();
        }, 3000);
    });
}

export function getCleanDataString() {
    const cleanData = {
        nodes: globalState.familyData.nodes.map(n => ({ 
            id: n.id, name: n.name, previousLastName: n.previousLastName || "", 
            role: n.role, birth: n.birth, hebrewBirthDate: n.hebrewBirthDate || "", death: n.death, hebrewDeathDate: n.hebrewDeathDate || "", 
            isAlive: n.isAlive, gender: n.gender, birthCountry: n.birthCountry || "", 
            lifeStory: n.lifeStory || "", profilePic: n.profilePic || "", 
            level: n.level || 0 
        })),
        links: globalState.familyData.links.map(l => ({
            source: typeof l.source === 'object' ? l.source.id : l.source;
            target: typeof l.target === 'object' ? l.target.id : l.target;
            type: l.type || "parent"
        }))
    };
    return JSON.stringify(cleanData, null, 4);
}
