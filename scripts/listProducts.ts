
import { getProducts } from '@/app/(app)/products/actions';

async function logAllProducts() {
    try {
        const { products } = await getProducts({ limit: 10000 }); // Fetch up to 10,000 products
        
        console.log("--- DANH SÁCH SẢN PHẨM HIỆN CÓ ---");
        if (products.length === 0) {
            console.log("Không tìm thấy sản phẩm nào trong hệ thống.");
            return;
        }

        const tableData = products.map(p => ({
            "Tên Sản Phẩm": p.name,
            "Mã SKU": p.sku
        }));
        
        console.table(tableData);
        console.log("--- KẾT THÚC DANH SÁCH ---");
        console.log(`\nVui lòng kiểm tra cột 'ma san pham' trong file Excel của bạn và đảm bảo nó khớp với một trong các 'Mã SKU' ở trên.`);

    } catch (error) {
        console.error("Lỗi khi lấy danh sách sản phẩm:", error);
    }
}

logAllProducts(); 