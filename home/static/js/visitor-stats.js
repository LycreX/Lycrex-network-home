// Fetch and display visitor statistics
async function fetchVisitorStats() {
    try {
        const statusResponse = await fetch('/api/status');
        const statusData = await statusResponse.json();
        
        // Check if configuration and visitor stats exist
        if (!statusData.visitor_stats || 
            !statusData.server || 
            !statusData.server.show_visitor_stats || 
            !statusData.server.show_visitor_stats.enabled) {
            return;
        }
        
        const showTotal = statusData.server.show_visitor_stats.show_total_visits;
        const showUnique = statusData.server.show_visitor_stats.show_unique_ips;
        const showPersonal = statusData.server.show_visitor_stats.show_personal_visits;
        
        // If nothing to display, return
        if (!showTotal && !showUnique && !showPersonal) {
            return;
        }
        
        // Create visitor stats element
        const visitorStatsElement = document.getElementById('visitor-stats');
        if (!visitorStatsElement) {
            return;
        }
        
        let statsHtml = '';
        let hasContent = false;
        
        if (showTotal) {
            statsHtml += `<span>Total Visits: ${statusData.visitor_stats.total_visits}</span>`;
            hasContent = true;
        }
        
        if (showUnique) {
            if (hasContent) statsHtml += ' | ';
            statsHtml += `<span>Unique IPs: ${statusData.visitor_stats.unique_ips}</span>`;
            hasContent = true;
        }
        
        // Get current IP visit count (if configuration allows)
        if (showPersonal) {
            try {
                const ipResponse = await fetch('/api/current-ip');
                if (ipResponse.ok) {
                    const ipData = await ipResponse.json();
                    
                    if (hasContent) {
                        statsHtml += ' | ';
                    }
                    
                    statsHtml += `<span>You(${ipData.ip}) visited: ${ipData.visits} times</span>`;
                }
            } catch (error) {
                console.error('Failed to get current IP statistics:', error);
            }
        }
        
        visitorStatsElement.innerHTML = statsHtml;
        visitorStatsElement.style.display = 'block';
    } catch (error) {
        console.error('Failed to fetch visitor statistics:', error);
    }
}

// Get visitor statistics after page loads
document.addEventListener('DOMContentLoaded', fetchVisitorStats);

setInterval(fetchVisitorStats, 10000); 