import { exec } from 'child_process';
import { promisify } from 'util';
import { format } from 'date-fns';

const execAsync = promisify(exec);

export async function createBackup() {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm');
    const fileName = `backup_${timestamp}.sql`;
    
    try {
        // Используем стандартную утилиту pg_dump
        await execAsync(`pg_dump ${process.env.DATABASE_URL} > ./backups/${fileName}`);
        console.log(`✅ Бэкап создан: ${fileName}`);
    } catch (error) {
        console.error("❌ Ошибка при создании бэкапа:", error);
    }
}
