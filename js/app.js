import { globalState } from './config.js';
import { fetchFamilyDatabase, saveToCloud } from './api.js';
import { initD3Graph, updateGraphView, resizeCanvas, zoomInAction, zoomOutAction, resetZoomAction, clearHighlights } from './graph.js';
import { openModal, closeModal, openModalForm, toggleDeathInputs, showToast, showConfirm } from './ui.js';

window.addEventListener('DOMContentLoaded', () => {
    initD3Graph();
    window.addEventListener('resize', resizeCanvas);

    // תחילת ריצה ומשיכת נתונים
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.style.opacity = '1', 10);

    fetchFamilyDatabase(
        () => { // הצלחה
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 500);
            document.getElementById('app-container').classList.remove('opacity-0');
            updateGraphView();
        },
        (error) => { // שגיאה
            document.getElementById('loader-spinner').style.display = 'none';
            document.getElementById('loader-title').innerText = "שגיאת תקשורת";
            document.getElementById('loader-subtitle').innerHTML = `לא הצלחנו למשוך את המידע מגוגל שיטס.<br><br><span class="text-rose-400 text-xs">שגיאה: ${error.toString()}</span>`;
            document.getElementById('setup-instructions').classList.remove('hidden');
            lucide.createIcons();
        },
        () => { // אין API מוגדר
            document.getElementById('loader-spinner').style.display = 'none';
            document.getElementById('loader-title').innerText = "חיבור ענן לא מוגדר";
            document.getElementById('loader-subtitle').innerText = "לא נמצאה כתובת API URL מוגדרת. באפשרותך להמשיך להשתמש במידע דמו מקומי.";
            document.getElementById('setup-instructions').classList.remove('hidden');
            lucide.createIcons();
        }
    );

    // חיבור כפתורי זום
    document.getElementById('btn-zoom-in').addEventListener('click', zoomInAction);
    document.getElementById('btn-zoom-out').addEventListener('click', zoomOutAction);
    document.getElementById('btn-zoom-reset').addEventListener('click', resetZoomAction);
    document.getElementById('btn-reset-filter').addEventListener('click', () => { globalState.filteredRootId = null; updateGraphView(); });

    // כפתור דמו במסך טעינה
    document.getElementById('btn-enter-demo').addEventListener('click', () => {
        import('./config.js').then(cfg => {
            globalState.familyData = JSON.parse(JSON.stringify(cfg.demoFamilyData));
            document.getElementById('demo-badge').classList.replace('hidden', 'flex');
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 500);
            updateGraphView();
        });
    });

    // כפתור הגדרות ראשי
    document.getElementById('btn-settings-trigger').addEventListener('click', () => {
        if (globalState.isAdmin) openModal('settings-menu-modal');
        else openModal('passcode-modal');
    });

    // טופס קוד גישה
    document.getElementById('btn-close-passcode').addEventListener('click', closeModal);
    document.getElementById('btn-submit-passcode').addEventListener('click', () => {
        if (document.getElementById('admin-passcode-input').value === "Eilon") {
            globalState.isAdmin = true;
            document.getElementById('admin-badge').classList.replace('hidden', 'flex');
            showToast("מצב עריכה פתוח כעת!");
            closeModal();
            updateGraphView();
        } else {
            showToast("קוד גישה שגוי.", "error");
        }
    });

    // תפריט עריכה פנימי
    document.getElementById('btn-switch-to-edit').addEventListener('click', () => {
        if (globalState.isAdmin) openModalForm(globalState.currentNode);
        else openModal('passcode-modal');
    });

    // מאזיני סגירת מודאלים גנריים
    document.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', closeModal));
    document.getElementById('modal-backdrop').addEventListener('click', closeModal);
    document.getElementById('btn-close-settings-menu').addEventListener('click', closeModal);
    document.getElementById('btn-close-confirm').addEventListener('click', closeModal);

    // שמירה בענן וגיבויים
    document.getElementById('btn-cloud-save').addEventListener('click', () => { closeModal(); saveToCloud(); });
    document.getElementById('btn-logout-admin').addEventListener('click', () => {
        globalState.isAdmin = false;
        document.getElementById('admin-badge').classList.replace('flex', 'hidden');
        closeModal(); updateGraphView(); showToast("מצב עריכה ננעל.");
    });
    document.getElementById('btn-export-html').addEventListener('click', () => {
        closeModal();
        globalState.filteredRootId = null; clearHighlights(); updateGraphView();
        import('./api.js').then(api => {
            let htmlContent = document.documentElement.outerHTML;
            const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const dl = document.createElement("a");
            dl.href = url; dl.download = "family_graph_updated.html";
            document.body.appendChild(dl); dl.click(); document.body.removeChild(dl);
        });
    });

    // שינוי סטטוס חיים בטופס
    document.getElementById('edit-status').addEventListener('change', toggleDeathInputs);

    // העלאת תמונה
    document.getElementById('btn-trigger-upload').addEventListener('click', () => document.getElementById('edit-pic-upload').click());
    document.getElementById('edit-pic-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 250; canvas.height = 250;
                canvas.getContext('2d').drawImage(img, 0, 0, 250, 250);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                document.getElementById('edit-pic-base64').value = dataUrl;
                document.getElementById('edit-pic-preview').src = dataUrl;
                document.getElementById('edit-pic-preview').classList.remove('hidden');
                document.getElementById('edit-pic-icon').classList.add('hidden');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // כפתורי שמירה ומחיקה בטופס העריכה
    document.getElementById('btn-save-node').addEventListener('click', () => {
        const node = globalState.familyData.nodes.find(n => n.id === globalState.currentNode.id);
        if (node) {
            node.name = document.getElementById('edit-name').value;
            node.previousLastName = document.getElementById('edit-prev-name').value;
            node.birth = document.getElementById('edit-birth').value;
            node.hebrewBirthDate = document.getElementById('edit-hebrew-birth').value;
            node.isAlive = document.getElementById('edit-status').value === "true";
            node.death = node.isAlive ? "" : document.getElementById('edit-death').value;
            node.hebrewDeathDate = node.isAlive ? "" : document.getElementById('edit-hebrew-death').value;
            node.role = document.getElementById('edit-role').value;
            node.gender = document.getElementById('edit-gender').value;
            node.birthCountry = document.getElementById('edit-country').value;
            node.lifeStory = document.getElementById('edit-story').value;
            node.profilePic = document.getElementById('edit-pic-base64').value;
        }
        closeModal(); updateGraphView();
        showToast("הרשומה עודכנה, אל תשכח לסנכרן לענן!");
    });

    document.getElementById('btn-add-child-modal').addEventListener('click', () => {
        const parentId = globalState.currentNode.id;
        closeModal();
        const parent = globalState.familyData.nodes.find(n => n.id === parentId);
        const newId = Date.now().toString();
        const newNode = { id: newId, name: "ילד/ה חדש/ה", role: "ילד", isAlive: true, gender: "neutral", level: (parent.level || 0) + 1, x: parent.x, y: parent.y + 200 };
        globalState.familyData.nodes.push(newNode);
        globalState.familyData.links.push({ source: parentId, target: newId, type: "parent" });
        openModalForm(newNode);
    });

    document.getElementById('btn-delete-node').addEventListener('click', () => {
        showConfirm(`למחוק את ${globalState.currentNode.name}?`, "פעולה זו תסיר את הישות מהגרף ותנתק את קשריה המשפחתיים.", () => {
            globalState.familyData.nodes = globalState.familyData.nodes.filter(n => n.id !== globalState.currentNode.id);
            globalState.familyData.links = globalState.familyData.links.filter(l => {
                const s = typeof l.source === 'object' ? l.source.id : l.source;
                const t = typeof l.target === 'object' ? l.target.id : l.target;
                return s !== globalState.currentNode.id && t !== globalState.currentNode.id;
            });
            closeModal(); updateGraphView(); showToast("הישות נמחקה מהגרף המקומי.");
        });
    });

    document.getElementById('btn-add-link').addEventListener('click', () => {
        const targetId = document.getElementById('add-link-target').value;
        const linkType = document.getElementById('add-link-type').value;
        if (!targetId) return;
        const s = linkType === 'parent' ? targetId : globalState.currentNode.id;
        const t = linkType === 'parent' ? globalState.currentNode.id : targetId;
        globalState.familyData.links.push({ source: s, target: t, type: linkType });
        closeModal(); updateGraphView(); showToast("הקשר המשפחתי החדש נוצר!");
    });
});
