//! A uniform grid over the plane for "what lies near this box" queries: items by their bounding boxes.
use std::collections::HashMap;

use crate::fixed::{Pt, floor_div};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BBox {
    pub x0: i64,
    pub y0: i64,
    pub x1: i64,
    pub y1: i64,
}

/// The box round some points, grown by `pad` on every side.
#[must_use]
pub fn box_of(pts: &[Pt], pad: i64) -> BBox {
    let mut b = BBox {
        x0: i64::MAX,
        y0: i64::MAX,
        x1: i64::MIN,
        y1: i64::MIN,
    };
    for p in pts {
        b.x0 = b.x0.min(p.x);
        b.y0 = b.y0.min(p.y);
        b.x1 = b.x1.max(p.x);
        b.y1 = b.y1.max(p.y);
    }
    BBox {
        x0: b.x0 - pad,
        y0: b.y0 - pad,
        x1: b.x1 + pad,
        y1: b.y1 + pad,
    }
}

/// Items indexed by box; a query returns, in insertion order and once each, every item whose box meets the query's.
pub struct Grid {
    cell: i64,
    cells: HashMap<(i64, i64), Vec<usize>>,
    boxes: Vec<BBox>,
}

impl Grid {
    #[must_use]
    pub fn new(cell: i64) -> Self {
        Self {
            cell,
            cells: HashMap::new(),
            boxes: Vec::new(),
        }
    }

    fn keys(&self, b: BBox) -> impl Iterator<Item = (i64, i64)> + use<> {
        let cell = self.cell;
        (floor_div(b.x0, cell)..=floor_div(b.x1, cell))
            .flat_map(move |cx| (floor_div(b.y0, cell)..=floor_div(b.y1, cell)).map(move |cy| (cx, cy)))
    }

    /// Adds the next item (numbered from 0) under its box.
    pub fn add(&mut self, b: BBox) {
        let id = self.boxes.len();
        self.boxes.push(b);
        for key in self.keys(b) {
            self.cells.entry(key).or_default().push(id);
        }
    }

    /// The items whose boxes meet the box, in insertion order.
    #[must_use]
    pub fn near(&self, b: BBox) -> Vec<usize> {
        let mut found: Vec<usize> = Vec::new();
        for key in self.keys(b) {
            for &id in self.cells.get(&key).into_iter().flatten() {
                let o = self.boxes[id];
                if o.x0 <= b.x1 && b.x0 <= o.x1 && o.y0 <= b.y1 && b.y0 <= o.y1 {
                    found.push(id);
                }
            }
        }
        found.sort_unstable();
        found.dedup();
        found
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_items_whose_boxes_meet_the_query_once_each_in_order() {
        let mut grid = Grid::new(10);
        grid.add(box_of(&[Pt::new(0, 0), Pt::new(25, 5)], 0));
        grid.add(box_of(&[Pt::new(100, 100)], 2));
        grid.add(box_of(&[Pt::new(-15, -15)], 0));
        assert_eq!(grid.near(box_of(&[Pt::new(5, 0), Pt::new(30, 30)], 0)), vec![0]);
        assert_eq!(
            grid.near(box_of(&[Pt::new(-20, -20), Pt::new(101, 101)], 0)),
            vec![0, 1, 2]
        );
        assert_eq!(grid.near(box_of(&[Pt::new(50, 50)], 0)), Vec::<usize>::new());
    }
}
