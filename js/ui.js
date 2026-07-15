import { globalState, nodeWidth, nodeHeight } from './config.js';
import { updateGraphView, getDescendantIds, clearHighlights } from './graph.js';

export function createNodeCard(data) {
    let colorClasses = "border-slate-200 text-slate-700 bg-white";
    let iconColor = "text-slate-400 bg-slate-100";
    if (data.gender === "male") { colorClasses = "border-blue-200 text-blue-900 bg-white"; iconColor = "text-blue-500 bg-blue-50"; }
    else if (data.gender === "female") { colorClasses = "border-rose-200 text-rose-900 bg-white"; iconColor = "text-rose-500 bg-rose-50"; }

    const isFemale = data.gender === 'female';
    const bornText = isFemale ? 'נולדה' : 'נולד';
    const celebrateText = isFemale ? 'חוגגת' : 'חוגג';

    let isBirthdayMonth = false;
    let currentHebMonth = "";
    if (data.isAlive && data.hebrewBirthDate) {
        try {
            currentHebMonth = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {month: 'long'}).format(new Date()).replace('מרחשוון', 'חשוון');
            if (data.hebrewBirthDate.replace(/['׳]/g, '').includes(currentHebMonth.replace(/['׳]/g, ''))) isBirthdayMonth = true;
        } catch(e) {}
    }

    if (isBirthdayMonth) {
        colorClasses = colorClasses.replace(/border-[a-z]+-200/, "border-indigo-400") + " ring-2 ring-indigo-400 shadow-md shadow-indigo-100";
    }

    // --- Calculate Age ---
    let ageHtml = '';
    if (data.birth) {
        const birthMatch = String(data.birth).match(/\d{4}/);
        const birthYear = birthMatch ? parseInt(birthMatch[0]) : null;

        if (birthYear) {
            let age = null;
            if (data.isAlive === false || data.isAlive === "false" || (data.death && data.death.trim() !== "")) {
                const deathMatch = data.death ? String(data.death).match(/\d{4}/) : null;
                const deathYear = deathMatch ? parseInt(deathMatch[0]) : null;
                if (deathYear) age = deathYear - birthYear;
            } else {
                age = new Date().getFullYear() - birthYear;
            }

            if (age !== null && !isNaN(age) && age >= 0) {
                ageHtml = `
                    <div class="flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shadow-sm w-max" title="גיל">
                        <i data-lucide="hourglass" class="w-3 h-3 pointer-events-none"></i>
                        <span>${age}</span>
                    </div>
                `;
            }
        }
    }

    // --- Calculate Descendants ---
    let descHtml = '';
    const descCount = getDescendantIds(data.id).size - 1;
    if (descCount > 0) {
        descHtml = `
            <div class="flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shadow-sm w-max" title="צאצאים">
                <i data-lucide="users" class="w-3 h-3 pointer-events-none"></i>
                <span>${descCount}</span>
            </div>
        `;
    }

    let badgesHtml = '';
    if (ageHtml || descHtml) {
        badgesHtml = `<div class="flex flex-wrap gap-1 mt-1">${ageHtml}${descHtml}</div>`;
    }

    let dateHtml = data.isAlive 
        ? `<div class="truncate">${data.birth ? `${bornText}:${data.birth}` : 'שנת לידה לא ידועה'}</div>` + (data.hebrewBirthDate ? (isBirthdayMonth ? `<div class="text-indigo-600 font-bold bg-indigo-50 inline-flex items-center gap-1 px-1.5 py-0.5 rounded mt-0.5 text-[10px] w-max"><i data-lucide="cake" class="w-3 h-3"></i> ${celebrateText} ב${currentHebMonth}!</div>` : `<div class="text-slate-400 text-[10px] mt-0.5 truncate">${data.hebrewBirthDate}</div>`) : '')
        : `<div class="truncate text-slate-600 font-semibold mt-0.5">${data.birth || '?'} - ${data.death || '?'}</div>` + (data.hebrewDeathDate ? `<div class="text-slate-400 text-[10px] mt-0.5 truncate">פטירה: ${data.hebrewDeathDate}</div>` : '');

    const accent = data.gender === 'male' ? 'bg-blue-400' : (data.gender === 'female' ? 'bg-rose-400' : 'bg-slate-400');
    const picHtml = data.profilePic ? `<img src="${data.profilePic}" class="w-full h-full object-cover" alt="פרופיל" />` : `<i data-lucide="user" class="w-5 h-5 pointer-events-none"></i>`;

    return `
        <div class="node-card border-2 ${colorClasses} rounded-xl h-full w-full flex items-center p-3 relative bg-white">
            <div class="absolute right-0 top-0 bottom-0 w-1.5 ${accent} rounded-r-xl pointer-events-none"></div>
            <div class="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center mr-2 ml-3 ${iconColor} overflow-hidden border border-slate-100 pointer-events-none">
                ${picHtml}
            </div>
            <div class="flex-1 overflow-hidden pl-7 pointer-events-none flex flex-col justify-center">
                <div class="font-bold text-sm truncate">${data.name || 'ללא שם'}</div>
                <div class="text-[11px] opacity-80 truncate mb-0">${data.role || 'ישות'}</div>
                <div class="text-xs text-slate-500 leading-snug flex flex-col justify-center">${dateHtml}</div>
                ${badgesHtml}
            </div>
            <button class="btn-card-info pointer-events-auto absolute top-2.5 left-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 bg-white/80 rounded-full p-1 transition-colors z-20" title="הצג פרטים מלאים">
                <i data-lucide="info" class="w-[18px] h-[18px] pointer-events-none"></i>
            </button>
        </div>`;
}

export function createActionBubbles() {
    if (globalState.isAdmin) {
        return `
            <div style="direction: ltr;" class="relative w-full h-full pointer-events-none">
                <svg class="absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none -z-10">
                    <path d="M 220 120 L 220 40" stroke="#6366f1" stroke-dasharray="3,3" stroke-width="2" fill="none" />
                    <path d="M 220 120 L 220 200" stroke="#10b981" stroke-dasharray="3,3" stroke-width="2" fill="none" />
                    <path d="M 220 120 L 60 120" stroke="#f43f5e" stroke-dasharray="3,3" stroke-width="2" fill="none" />
                    <path d="M 220 120 C 300 120, 300 85, 345 85" stroke="#94a3b8" stroke-width="1.5" fill="none" />
                    <path d="M 220 120 C 300 120, 300 155, 345 155" stroke="#94a3b8" stroke-width="1.5" fill="none" />
                </svg>
                <div class="action-btn-add-parent absolute flex items-center pointer-events-auto z-10 cursor-pointer" style="left: 220px; top: 25px; transform: translate(-50%, -50%);">
                    <button class="px-3 py-1.5 rounded-full bg-indigo-600 text-white flex items-center gap-1.5 text-xs font-bold shadow-md hover:bg-indigo-700 transition-all transform hover:scale-105">
                        <i data-lucide="arrow-up" class="w-3.5 h-3.5"></i><span>הוסף הורה</span>
                    </button>
                </div>
                <div class="action-btn-add-child absolute flex items-center pointer-events-auto z-10 cursor-pointer" style="left: 220px; top: 215px; transform: translate(-50%, -50%);">
                    <button class="px-3 py-1.5 rounded-full bg-emerald-600 text-white flex items-center gap-1.5 text-xs font-bold shadow-md hover:bg-emerald-700 transition-all transform hover:scale-105">
                        <i data-lucide="arrow-down" class="w-3.5 h-3.5"></i><span>הוסף ילד</span>
                    </button>
                </div>
                <div class="action-btn-add-spouse absolute flex items-center pointer-events-auto z-10 cursor-pointer" style="left: 45px; top: 120px; transform: translate(-50%, -50%);">
                    <button class="px-3 py-1.5 rounded-full bg-rose-500 text-white flex items-center gap-1.5 text-xs font-bold shadow-md hover:bg-rose-600 transition-all transform hover:scale-105">
                        <i data-lucide="heart" class="w-3.5 h-3.5"></i><span>בן זוג</span>
                    </button>
                </div>
                <div class="action-btn-details absolute flex items-center pointer-events-auto z-10 cursor-pointer" style="left: 380px; top: 85px; transform: translate(-50%, -50%);">
                    <button class="w-9 h-9 rounded-full bg-white border-2 border-indigo-500 text-indigo-600 flex items-center justify-center hover:bg-indigo-50 shadow-md transform hover:scale-105">
                        <i data-lucide="info" class="w-4 h-4"></i>
                    </button>
                    <span class="ml-1.5 text-xs font-bold text-slate-700 bg-white/90 px-1.5 py-0.5 rounded shadow-sm">פרטים</span>
                </div>
                <div class="action-btn-family absolute flex items-center pointer-events-auto z-10 cursor-pointer" style="left: 380px; top: 155px; transform: translate(-50%, -50%);">
                    <button class="w-9 h-9 rounded-full bg-white border-2 border-emerald-500 text-emerald-600 flex items-center justify-center hover:bg-emerald-50 shadow-md transform hover:scale-105">
                        <i data-lucide="users" class="w-4 h-4"></i>
                    </button>
                    <span class="ml-1.5 text-xs font-bold text-slate-700 bg-white/90 px-1.5 py-0.5 rounded shadow-sm">משפחה</span>
                </div>
            </div>`;
    }
    return `
        <div style="direction: ltr;" class="relative w-full h-full pointer-events-none">
            <svg class="absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none -z-10">
                <path d="M 220 120 C 260 120, 260 85, 295 85" stroke="#94a3b8" stroke-width="2" fill="none" />
                <path d="M 220 120 C 260 120, 260 155, 295 155" stroke="#94a3b8" stroke-width="2" fill="none" />
            </svg>
            <div class="action-btn-details absolute flex items-center pointer-events-auto z-10 cursor-pointer" style="left: 330px; top: 85px; transform: translate(-50%, -50%);">
                <button class="w-10 h-10 rounded-full bg-white border-2 border-indigo-500 text-indigo-600 flex items-center justify-center hover:bg-indigo-50 shadow-md transform hover:scale-105">
                    <i data-lucide="info" class="w-5 h-5"></i>
                </button>
                <span class="ml-2 text-sm font-bold text-slate-700 bg-white/90 px-2 py-1 rounded shadow-sm">פרטים</span>
            </div>
            <div class="action-btn-family absolute flex items-center pointer-events-auto z-10 cursor-pointer" style="left: 330px; top: 155px; transform: translate(-50%, -50%);">
                <button class="w-10 h-10 rounded-full bg-white border-2 border-emerald-500 text-emerald-600 flex items-center justify-center hover:bg-emerald-50 shadow-md transform hover:scale-105">
                    <i data-lucide="users" class="w-5 h-5"></i>
                </button>
                <span class="ml-2 text-sm font-bold text-slate-700 bg-white/90 px-2 py-1 rounded shadow-sm">משפחה</span>
            </div>
        </div>`;
}

export function showNodeDetailsById(id, event) {
    if(event) { event.stopPropagation(); event.preventDefault(); }
    d3.selectAll(".node-actions").style("opacity", 0).style("pointer-events", "none");
    
    const data = globalState.familyData.nodes.find(n => n.id === id);
    if (!data) return;
    globalState.currentNode = data;

    document.getElementById('view-name').innerText = data.name || 'ללא שם';
    
    // Calculate Age for the detailed modal
    let modalAgeHtml = '';
    if (data.birth) {
        const birthMatch = String(data.birth).match(/\d{4}/);
        const birthYear = birthMatch ? parseInt(birthMatch[0]) : null;
        if (birthYear) {
            let age = null;
            if (data.isAlive === false || data.isAlive === "false" || (data.death && data.death.trim() !== "")) {
                const deathMatch = data.death ? String(data.death).match(/\d{4}/) : null;
                const deathYear = deathMatch ? parseInt(deathMatch[0]) : null;
                if (deathYear) age = deathYear - birthYear;
            } else {
                age = new Date().getFullYear() - birthYear;
            }
            if (age !== null && !isNaN(age) && age >= 0) {
                modalAgeHtml = ` <span class="mx-2 text-slate-300">|</span> <span class="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1"><i data-lucide="hourglass" class="w-3 h-3"></i> גיל: ${age}</span>`;
            }
        }
    }

    document.getElementById('view-dates').innerHTML = data.isAlive 
        ? `${data.gender === 'female' ? 'נולדה' : 'נולד'}: ${data.birth || '?'}${modalAgeHtml}`
        : `<span class="text-slate-500 text-sm">נולד/ה:</span> ${data.birth || '?'} <span class="mx-2 text-slate-300">|</span> <span class="text-slate-500 text-sm">פטירה:</span> ${data.death || '?'}${modalAgeHtml}`;
    
    if (data.previousLastName) {
        document.getElementById('view-prev-name').innerText = data.previousLastName;
        document.getElementById('view-prev-name-container').classList.remove('hidden');
    } else {
        document.getElementById('view-prev-name-container').classList.add('hidden');
    }

    if (data.role) { document.getElementById('view-role').innerText = data.role; document.getElementById('view-role').classList.remove('hidden'); }
    else { document.getElementById('view-role').classList.add('hidden'); }

    if (data.birthCountry) { document.getElementById('view-country-text').innerText = data.birthCountry; document.getElementById('view-country').classList.remove('hidden'); }
    else { document.getElementById('view-country').classList.add('hidden'); }

    const hebrewDateEl = document.getElementById('view-hebrew-date');
    if (data.isAlive && data.hebrewBirthDate) {
         document.getElementById('view-hebrew-date-text').innerText = data.hebrewBirthDate;
         hebrewDateEl.classList.remove('hidden');
    } else if (!data.isAlive && data.hebrewDeathDate) {
        document.getElementById('view-hebrew-date-text').innerText = `תאריך פטירה: ${data.hebrewDeathDate}`;
        hebrewDateEl.classList.remove('hidden');
    } else {
        hebrewDateEl.classList.add('hidden');
    }

    const descCount = getDescendantIds(data.id).size - 1;
    if (descCount > 0) {
        document.getElementById('view-descendants-text').innerText = `${descCount} צאצאים`;
        document.getElementById('view-descendants').classList.remove('hidden');
    } else {
        document.getElementById('view-descendants').classList.add('hidden');
    }

    if (data.lifeStory && data.lifeStory.trim() !== '') {
        document.getElementById('view-story').innerText = data.lifeStory;
        document.getElementById('view-story-container').classList.remove('hidden');
    } else {
        document.getElementById('view-story-container').classList.add('hidden');
    }
    
    document.getElementById('view-icon-bg').className = "w-28 h-28 mx-auto rounded-full flex items-center justify-center mb-3 shadow-md border-4 border-white overflow-hidden relative " + 
        (data.gender === 'male' ? 'bg-blue-400' : (data.gender === 'female' ? 'bg-rose-400' : 'bg-slate-400'));
    
    const picEl = document.getElementById('view-profile-pic');
    if (data.profilePic) { picEl.src = data.profilePic; picEl.classList.remove('hidden'); }
    else { picEl.classList.add('hidden'); }

    openModal('view-modal');
    lucide.createIcons();
}

export function filterFamilyById(id, event) {
    if(event) { event.stopPropagation(); event.preventDefault(); }
    globalState.filteredRootId = id;
    clearHighlights(); 
    updateGraphView();
}

export function openModalForm(data) {
    globalState.currentNode = data;
    document.getElementById('edit-node-id').value = data.id;
    document.getElementById('edit-name').value = data.name || '';
    document.getElementById('edit-prev-name').value = data.previousLastName || '';
    document.getElementById('edit-birth').value = data.birth || '';
    document.getElementById('edit-hebrew-birth').value = data.hebrewBirthDate || '';
    document.getElementById('edit-death').value = data.death || '';
    document.getElementById('edit-hebrew-death').value = data.hebrewDeathDate || '';
    document.getElementById('edit-role').value = data.role || '';
    document.getElementById('edit-gender').value = data.gender || 'neutral';
    document.getElementById('edit-country').value = data.birthCountry || '';
    document.getElementById('edit-status').value = data.isAlive ? "true" : "false";
    document.getElementById('edit-story').value = data.lifeStory || '';
    document.getElementById('edit-pic-base64').value = data.profilePic || '';
    
    const preview = document.getElementById('edit-pic-preview');
    const icon = document.getElementById('edit-pic-icon');
    if(data.profilePic) { preview.src = data.profilePic; preview.classList.remove('hidden'); icon.classList.add('hidden'); }
    else { preview.classList.add('hidden'); icon.classList.remove('hidden'); }

    toggleDeathInputs();

    const targetSelect = document.getElementById('add-link-target');
    targetSelect.innerHTML = '<option value="">בחר ישות...</option>';
    globalState.familyData.nodes.forEach(n => {
        if(n.id !== globalState.currentNode.id) {
            const opt = document.createElement('option');
            opt.value = n.id; opt.textContent = n.name;
            targetSelect.appendChild(opt);
        }
    });

    openModal('action-modal');
}

export function toggleDeathInputs() {
    const isAlive = document.getElementById('edit-status').value === "true";
    if (isAlive) { 
        document.getElementById('edit-death-wrapper').classList.add('opacity-40', 'pointer-events-none'); 
        document.getElementById('edit-hebrew-death-wrapper').classList.add('opacity-40', 'pointer-events-none');
        document.getElementById('edit-hebrew-birth-wrapper').classList.remove('opacity-40', 'pointer-events-none');
    } else { 
        document.getElementById('edit-death-wrapper').classList.remove('opacity-40', 'pointer-events-none'); 
        document.getElementById('edit-hebrew-death-wrapper').classList.remove('opacity-40', 'pointer-events-none');
        document.getElementById('edit-hebrew-birth-wrapper').classList.add('opacity-40', 'pointer-events-none');
    }
}

export function openModal(id) {
    const backdrop = document.getElementById('modal-backdrop');
    const modal = document.getElementById(id);
    
    if (backdrop) backdrop.classList.remove('hidden');
    if (modal) modal.classList.remove('hidden');
    
    setTimeout(() => {
        if (backdrop) backdrop.classList.add('backdrop-enter-active');
        if (modal) modal.classList.add('modal-enter-active');
    }, 10);
}

export function closeModal() {
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.classList.remove('backdrop-enter-active');
    
    const modals = ['view-modal', 'action-modal', 'passcode-modal', 'settings-menu-modal', 'confirm-modal'];
    
    // 1. Remove active classes safely
    modals.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('modal-enter-active');
    });
    
    // 2. Wait for animation to finish, then hide safely
    setTimeout(() => {
        modals.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        if (backdrop) backdrop.classList.add('hidden'); // Removes the invisible shield!
    }, 300);
}
export function showToast(message, type = "success") {
    const toast = document.getElementById("toast-notification");
    document.getElementById("toast-message").innerText = message;
    const icon = document.getElementById("toast-icon-container");
    
    if (type === "success") {
        toast.className = "fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl z-[70] flex items-center gap-3 transition-all duration-300 transform translate-y-0 opacity-100 border-l-4 border-emerald-500";
        icon.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-emerald-400"></i>`;
    } else {
        toast.className = "fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl z-[70] flex items-center gap-3 transition-all duration-300 transform translate-y-0 opacity-100 border-l-4 border-rose-500";
        icon.innerHTML = `<i data-lucide="alert-triangle" class="w-4 h-4 text-rose-400"></i>`;
    }
    lucide.createIcons();
    if (toast.timeoutId) clearTimeout(toast.timeoutId);
    toast.timeoutId = setTimeout(() => {
        toast.classList.add("translate-y-10", "opacity-0");
        setTimeout(() => { toast.classList.add("hidden"); }, 300);
    }, 3500);
    toast.classList.remove("hidden");
}

export function showConfirm(title, body, onApprove) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-body').innerText = body;
    openModal('confirm-modal');
    document.getElementById('btn-approve-confirm').onclick = () => { onApprove(); closeModal(); };
}
