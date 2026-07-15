import { globalState } from './config.js';
import { focusNode } from './graph.js';
// Removed the showNodeDetailsById import as it's no longer forced on search

export function initSearch() {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');

    if (!searchInput || !searchResults) return;

    // Listen to user typing
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        searchResults.innerHTML = '';

        if (query.length < 2) {
            searchResults.classList.add('hidden');
            return;
        }

        // Filter nodes based on name or previous last name
        const matches = globalState.familyData.nodes.filter(node => {
            const nameMatch = (node.name || '').toLowerCase().includes(query);
            const prevNameMatch = (node.previousLastName || '').toLowerCase().includes(query);
            return nameMatch || prevNameMatch;
        });

        if (matches.length === 0) {
            searchResults.innerHTML = '<li class="px-4 py-3 text-sm text-slate-500 text-center">לא נמצאו תוצאות</li>';
            searchResults.classList.remove('hidden');
            return;
        }

        // Populate dropdown with results
        matches.forEach(node => {
            const li = document.createElement('li');
            li.className = 'px-4 py-2 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors flex items-center gap-3';
            
            const pic = node.profilePic 
                ? `<img src="${node.profilePic}" class="w-8 h-8 rounded-full object-cover shadow-sm">` 
                : `<div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"><i data-lucide="user" class="w-4 h-4 text-slate-500"></i></div>`;
            
            li.innerHTML = `
                ${pic}
                <div>
                    <div class="font-semibold text-slate-700 text-sm">${node.name || 'ללא שם'}</div>
                    ${node.birth ? `<div class="text-xs text-slate-400">יליד/ה ${node.birth}</div>` : ''}
                </div>
            `;

            // Handle user selection
            li.addEventListener('click', () => {
                // Clear input and hide results
                searchInput.value = '';
                searchInput.blur(); 
                searchResults.classList.add('hidden');
                
                // Trigger ONLY the camera focus and visual highlight
                // This now behaves exactly like a native click on the canvas!
                focusNode(node.id);
            });

            searchResults.appendChild(li);
        });

        searchResults.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.add('hidden');
        }
    });
}
