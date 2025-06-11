package com.yallajay.customerapp.ui.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.yallajay.customerapp.R
import com.yallajay.customerapp.model.OrderItem

class OrderDetailAdapter(private val items: List<OrderItem>) :
    RecyclerView.Adapter<OrderDetailAdapter.OrderItemViewHolder>() {

    class OrderItemViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val productName: TextView = itemView.findViewById(R.id.productNameTextView)
        val quantityPrice: TextView = itemView.findViewById(R.id.quantityPriceTextView)
        val itemSubtotal: TextView = itemView.findViewById(R.id.itemSubtotalTextView)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): OrderItemViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_order_product, parent, false)
        return OrderItemViewHolder(view)
    }

    override fun onBindViewHolder(holder: OrderItemViewHolder, position: Int) {
        val item = items[position]
        holder.productName.text = item.productName
        holder.quantityPrice.text = "الكمية: ${item.quantity} × ${item.priceAtPurchase} ل.س"
        holder.itemSubtotal.text = "${item.itemSubtotal} ل.س"
    }

    override fun getItemCount(): Int {
        return items.size
    }
}
