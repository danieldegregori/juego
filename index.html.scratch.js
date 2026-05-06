        function initLevel(num) {
            player.x = 100; player.y = canvas.height - 300;
            player.dy = 0; player.dx = 0; player.grounded = false;
            platforms = []; collectibles = []; entities = []; obstacles = [];
            gameState.score = 0;
            gameState.hasKey = false;
            updateHUD();

            if (num === 1) { // Neon Runner - Extended & More complex
                gameState.worldWidth = 8000;
                platforms.push({ x: 0, y: canvas.height - 100, w: 8000, h: 100, type: 'ground' });
                
                // Spacing out collectibles and ensuring they are reachable
                for(let i=0; i<30; i++) {
                    const isMemory = i % 6 === 0 && i/6 < 5;
                    collectibles.push({ 
                        x: 1000 + i * 250, 
                        y: canvas.height - 150 - Math.random() * 80, // Reachable by jump (50-130px above ground)
                        type: isMemory ? 'memory' : 'sparkle', 
                        idx: isMemory ? i/6 : -1 
                    });
                }
                // Spacing out obstacles significantly
                for(let i=0; i<20; i++) {
                    obstacles.push({ x: 1200 + i * 450, y: canvas.height - 140, w: 40, h: 40 });
                }
            } else if (num === 2) { // Exploration - Multi-level
                gameState.worldWidth = 3000;
                gameState.worldHeight = 2000;
                player.x = 100;
                player.y = 1800;
                
                // Better Platform Path
                platforms.push({ x: 0, y: 1900, w: 800, h: 100 });
                platforms.push({ x: 900, y: 1750, w: 400, h: 20 });
                platforms.push({ x: 1400, y: 1600, w: 400, h: 20 });
                platforms.push({ x: 1900, y: 1500, w: 300, h: 20 });
                platforms.push({ x: 1400, y: 1350, w: 400, h: 20 }); // Powerup here
                platforms.push({ x: 900, y: 1250, w: 400, h: 20 });
                platforms.push({ x: 400, y: 1100, w: 400, h: 20 }); // Key here
                platforms.push({ x: 900, y: 950, w: 400, h: 20 });
                platforms.push({ x: 1400, y: 800, w: 600, h: 20, type: 'gate' }); // Gate
                
                collectibles.push({ x: 1500, y: 1300, type: 'powerup' }); // Double Jump
                collectibles.push({ x: 500, y: 1050, type: 'key' }); // Golden Key
                
                // Align memories with platforms
                const memCoords = [
                    {x: 400, y: 1850}, {x: 1000, y: 1700}, {x: 1500, y: 1550}, 
                    {x: 2000, y: 1450}, {x: 1000, y: 1200}
                ];
                memCoords.forEach((c, i) => {
                    collectibles.push({ x: c.x, y: c.y, type: 'memory', idx: i });
                });
            } else if (num === 3) { // The Final Challenge
                gameState.worldWidth = canvas.width;
                gameState.worldHeight = canvas.height;
                gameState.bossActive = true;
                gameState.bossHealth = 100;
                platforms.push({ x: 0, y: canvas.height - 100, w: canvas.width, h: 100 });
            }
        }
