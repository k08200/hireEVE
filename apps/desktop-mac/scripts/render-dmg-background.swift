// Render the DMG window background: warm paper, an arrow from the app slot to
// the Applications slot, and one caption. Drawn with CoreGraphics so the asset
// is reproducible from source — no binary blob checked in, no design tool.
//
// usage: render-dmg-background <out-base>   → writes <out-base>.png and @2x.png
import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count == 2 else {
    FileHandle.standardError.write(Data("usage: render-dmg-background <out-base>\n".utf8))
    exit(2)
}
let W = 660.0, H = 400.0

func render(scale: CGFloat, to url: URL) {
    let w = Int(W * scale), h = Int(H * scale)
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8,
                        bytesPerRow: 0, space: cs,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.scaleBy(x: scale, y: scale)

    // The landing's warm paper, with a faint blush wash so the window reads as
    // the same product the download page did.
    ctx.setFillColor(CGColor(red: 0.984, green: 0.980, blue: 0.965, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    let grad = CGGradient(colorsSpace: cs, colors: [
        CGColor(red: 0.949, green: 0.871, blue: 0.855, alpha: 0.55),
        CGColor(red: 0.984, green: 0.980, blue: 0.965, alpha: 0.0),
    ] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(grad, start: CGPoint(x: W / 2, y: H),
                           end: CGPoint(x: W / 2, y: H * 0.45), options: [])

    // Arrow between the two icon slots (icons sit at y≈205 in Finder's
    // top-origin coords → CG bottom-origin ≈ H-205). Icon centres x=180/480.
    let y = H - 205.0
    ctx.setStrokeColor(CGColor(red: 0.29, green: 0.33, blue: 0.38, alpha: 0.65))
    ctx.setLineWidth(3)
    ctx.setLineCap(.round)
    ctx.move(to: CGPoint(x: 270, y: y))
    ctx.addLine(to: CGPoint(x: 385, y: y))
    ctx.strokePath()
    ctx.move(to: CGPoint(x: 367, y: y + 12)); ctx.addLine(to: CGPoint(x: 385, y: y))
    ctx.addLine(to: CGPoint(x: 367, y: y - 12))
    ctx.strokePath()

    // Caption under the icons.
    let para = NSMutableParagraphStyle(); para.alignment = .center
    let text = NSAttributedString(string: "Drag Klorn into Applications to install",
        attributes: [
            .font: NSFont.systemFont(ofSize: 14, weight: .medium),
            .foregroundColor: NSColor(srgbRed: 0.29, green: 0.33, blue: 0.38, alpha: 1),
            .paragraphStyle: para,
        ])
    let gctx = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.current = gctx
    text.draw(in: CGRect(x: 0, y: 52, width: W, height: 24))
    NSGraphicsContext.current = nil

    let img = ctx.makeImage()!
    let rep = NSBitmapImageRep(cgImage: img)
    rep.size = NSSize(width: W, height: H)   // point size → correct DPI metadata
    try! rep.representation(using: .png, properties: [:])!.write(to: url)
}

let base = args[1]
render(scale: 1, to: URL(fileURLWithPath: base + ".png"))
render(scale: 2, to: URL(fileURLWithPath: base + "@2x.png"))
print("wrote \(base).png / @2x.png")
