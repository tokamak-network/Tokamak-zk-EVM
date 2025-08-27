use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicUsize, Ordering};
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;

/// 🚀 메모리 풀 통계 정보
#[derive(Debug, Clone)]
pub struct PoolStats {
    pub total_allocated: usize,
    pub total_reused: usize,
    pub total_pooled: usize,
    pub pool_sizes: Vec<usize>,
}

/// 🚀 Vec<u8> 전용 메모리 풀
pub struct MemoryPool {
    pools: Arc<Mutex<HashMap<usize, Vec<Vec<u8>>>>>,
    total_allocated: AtomicUsize,
    total_reused: AtomicUsize,
}

impl MemoryPool {
    pub fn new() -> Self {
        Self {
            pools: Arc::new(Mutex::new(HashMap::new())),
            total_allocated: AtomicUsize::new(0),
            total_reused: AtomicUsize::new(0),
        }
    }

    /// 🚀 메모리 풀에서 버퍼 가져오기
    pub fn get_buffer(&self, size: usize) -> Vec<u8> {
        let mut pools = self.pools.lock().unwrap();
        
        if let Some(pool) = pools.get_mut(&size) {
            if let Some(mut buffer) = pool.pop() {
                self.total_reused.fetch_add(1, Ordering::Relaxed);
                buffer.resize(size, 0);
                return buffer;
            }
        }
        
        self.total_allocated.fetch_add(1, Ordering::Relaxed);
        vec![0; size]
    }

    /// 🚀 메모리 풀에 버퍼 반환
    pub fn return_buffer(&self, mut buffer: Vec<u8>) {
        let size = buffer.capacity();
        if size > 0 {
            buffer.clear();
            let mut pools = self.pools.lock().unwrap();
            pools.entry(size).or_insert_with(Vec::new).push(buffer);
        }
    }

    /// 🚀 메모리 풀 통계 가져오기
    pub fn stats(&self) -> PoolStats {
        let pools = self.pools.lock().unwrap();
        let total_pooled: usize = pools.values().map(|v| v.len()).sum();
        let pool_sizes: Vec<usize> = pools.keys().cloned().collect();
        
        PoolStats {
            total_allocated: self.total_allocated.load(Ordering::Relaxed),
            total_reused: self.total_reused.load(Ordering::Relaxed),
            total_pooled,
            pool_sizes,
        }
    }

    /// 🚀 메모리 풀 정리
    pub fn clear(&self) {
        let mut pools = self.pools.lock().unwrap();
        pools.clear();
        self.total_allocated.store(0, Ordering::Relaxed);
        self.total_reused.store(0, Ordering::Relaxed);
    }
}

/// 🚀 ScalarField 전용 메모리 풀
pub struct ScalarFieldMemoryPool {
    pools: Arc<Mutex<HashMap<usize, Vec<Vec<ScalarField>>>>>,
    total_allocated: AtomicUsize,
    total_reused: AtomicUsize,
}

impl ScalarFieldMemoryPool {
    pub fn new() -> Self {
        Self {
            pools: Arc::new(Mutex::new(HashMap::new())),
            total_allocated: AtomicUsize::new(0),
            total_reused: AtomicUsize::new(0),
        }
    }

    /// 🚀 ScalarField 메모리 풀에서 버퍼 가져오기
    pub fn get_scalar_field_buffer(&self, size: usize) -> Vec<ScalarField> {
        let mut pools = self.pools.lock().unwrap();
        
        if let Some(pool) = pools.get_mut(&size) {
            if let Some(mut buffer) = pool.pop() {
                self.total_reused.fetch_add(1, Ordering::Relaxed);
                buffer.resize(size, ScalarField::zero());
                return buffer;
            }
        }
        
        self.total_allocated.fetch_add(1, Ordering::Relaxed);
        vec![ScalarField::zero(); size]
    }

    /// 🚀 ScalarField 메모리 풀에 버퍼 반환
    pub fn return_scalar_field_buffer(&self, mut buffer: Vec<ScalarField>) {
        let size = buffer.capacity();
        if size > 0 {
            buffer.clear();
            let mut pools = self.pools.lock().unwrap();
            pools.entry(size).or_insert_with(Vec::new).push(buffer);
        }
    }

    /// 🚀 ScalarField 메모리 풀 통계 가져오기
    pub fn stats(&self) -> PoolStats {
        let pools = self.pools.lock().unwrap();
        let total_pooled: usize = pools.values().map(|v| v.len()).sum();
        let pool_sizes: Vec<usize> = pools.keys().cloned().collect();
        
        PoolStats {
            total_allocated: self.total_allocated.load(Ordering::Relaxed),
            total_reused: self.total_reused.load(Ordering::Relaxed),
            total_pooled,
            pool_sizes,
        }
    }

    /// 🚀 ScalarField 메모리 풀 정리
    pub fn clear(&self) {
        let mut pools = self.pools.lock().unwrap();
        pools.clear();
        self.total_allocated.store(0, Ordering::Relaxed);
        self.total_reused.store(0, Ordering::Relaxed);
    }
}

/// 🚀 전역 메모리 풀 인스턴스
lazy_static::lazy_static! {
    pub static ref GLOBAL_MEMORY_POOL: MemoryPool = MemoryPool::new();
    pub static ref GLOBAL_SCALAR_FIELD_MEMORY_POOL: ScalarFieldMemoryPool = ScalarFieldMemoryPool::new();
}

/// 🚀 전역 Vec<u8> 메모리 풀에서 버퍼 가져오기
pub fn get_global_buffer(size: usize) -> Vec<u8> {
    GLOBAL_MEMORY_POOL.get_buffer(size)
}

/// 🚀 전역 Vec<u8> 메모리 풀에 버퍼 반환
pub fn return_global_buffer(buffer: Vec<u8>) {
    GLOBAL_MEMORY_POOL.return_buffer(buffer);
}

/// 🚀 전역 ScalarField 메모리 풀에서 버퍼 가져오기
pub fn get_global_scalar_field_buffer(size: usize) -> Vec<ScalarField> {
    GLOBAL_SCALAR_FIELD_MEMORY_POOL.get_scalar_field_buffer(size)
}

/// 🚀 전역 ScalarField 메모리 풀에 버퍼 반환
pub fn return_global_scalar_field_buffer(buffer: Vec<ScalarField>) {
    GLOBAL_SCALAR_FIELD_MEMORY_POOL.return_scalar_field_buffer(buffer);
}

/// 🚀 전역 메모리 풀 통계 가져오기
pub fn get_global_pool_stats() -> PoolStats {
    GLOBAL_MEMORY_POOL.stats()
}

/// 🚀 전역 ScalarField 메모리 풀 통계 가져오기
pub fn get_global_scalar_field_pool_stats() -> PoolStats {
    GLOBAL_SCALAR_FIELD_MEMORY_POOL.stats()
}

/// 🚀 메모리 풀 통계 출력
pub fn print_memory_pool_stats() {
    let stats = get_global_pool_stats();
    let scalar_field_stats = get_global_scalar_field_pool_stats();
    
    println!("🚀 메모리 풀 통계:");
    println!("  📦 Vec<u8> 풀:");
    println!("    총 할당: {}", stats.total_allocated);
    println!("    총 재사용: {}", stats.total_reused);
    println!("    현재 풀링된 버퍼: {}", stats.total_pooled);
    println!("    풀 크기들: {:?}", stats.pool_sizes);
    
    println!("  🔢 ScalarField 풀:");
    println!("    총 할당: {}", scalar_field_stats.total_allocated);
    println!("    총 재사용: {}", scalar_field_stats.total_reused);
    println!("    현재 풀링된 버퍼: {}", scalar_field_stats.total_pooled);
    println!("    풀 크기들: {:?}", scalar_field_stats.pool_sizes);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_memory_pool_basic() {
        let pool = MemoryPool::new();
        
        // 버퍼 할당
        let buffer1 = pool.get_buffer(100);
        assert_eq!(buffer1.len(), 100);
        
        // 버퍼 반환
        pool.return_buffer(buffer1);
        
        // 같은 크기로 다시 가져오기
        let buffer2 = pool.get_buffer(100);
        assert_eq!(buffer2.len(), 100);
        
        let stats = pool.stats();
        assert_eq!(stats.total_allocated, 1);
        assert_eq!(stats.total_reused, 1);
    }

    #[test]
    fn test_global_memory_pool() {
        // 전역 풀 테스트
        let buffer = get_global_buffer(50);
        assert_eq!(buffer.len(), 50);
        
        return_global_buffer(buffer);
        
        let stats = get_global_pool_stats();
        assert_eq!(stats.total_allocated, 1);
        assert_eq!(stats.total_reused, 0); // 아직 재사용되지 않음
    }

    #[test]
    fn test_scalar_field_memory_pool_basic() {
        let pool = ScalarFieldMemoryPool::new();
        
        // ScalarField 버퍼 할당
        let buffer1 = pool.get_scalar_field_buffer(200);
        assert_eq!(buffer1.len(), 200);
        
        // 버퍼 반환
        pool.return_scalar_field_buffer(buffer1);
        
        // 같은 크기로 다시 가져오기
        let buffer2 = pool.get_scalar_field_buffer(200);
        assert_eq!(buffer2.len(), 200);
        
        let stats = pool.stats();
        assert_eq!(stats.total_allocated, 1);
        assert_eq!(stats.total_reused, 1);
    }

    #[test]
    fn test_global_scalar_field_memory_pool() {
        // 전역 ScalarField 풀 테스트
        let buffer = get_global_scalar_field_buffer(75);
        assert_eq!(buffer.len(), 75);
        
        return_global_scalar_field_buffer(buffer);
        
        let stats = get_global_scalar_field_pool_stats();
        assert_eq!(stats.total_allocated, 1);
        assert_eq!(stats.total_reused, 0); // 아직 재사용되지 않음
    }
} 