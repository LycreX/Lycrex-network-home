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
                // get visitor IP address
                const ipAddress = await getVisitorIpAddress();
                
                // report visit information
                const reportResponse = await reportVisit(ipAddress);
                
                if (hasContent) {
                    statsHtml += ' | ';
                }
                
                // show visit count
                if (reportResponse.success) {
                    statsHtml += `<span>You(${ipAddress}) visited: ${reportResponse.visits} times</span>`;
                } else {
                    statsHtml += `<span>You(${ipAddress})'s visit statistics are not available</span>`;
                }
            } catch (error) {
                console.error('Failed to get/report visit statistics:', error);
                if (hasContent) statsHtml += ' | ';
                statsHtml += `<span>Failed to get visit statistics</span>`;
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

setInterval(fetchVisitorStats, 60000); 

// get visitor IP address
async function getVisitorIpAddress() {
    try {
        const response = await fetch('https://api.db-ip.com/v2/free/self');
        const data = await response.json();
        return data.ipAddress;
    } catch (secondError) {
        const randomIP = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        return randomIP;
    }
}

// report visit information
async function reportVisit(ipAddress) {
    try {
        const response = await fetch('/api/report-visitor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ip: ipAddress }),
        });
        
        return await response.json();
    } catch (error) {
        console.error('report visit failed:', error);
        return { success: false, message: 'report visit failed', visits: 0 };
    }
} 